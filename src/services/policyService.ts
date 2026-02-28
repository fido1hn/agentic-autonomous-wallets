import type {
  PolicyRecord,
  PolicyRepository,
  WalletBindingRepository,
  WalletPolicyAssignmentRepository
} from "../db/sqlite";
import type { AegisPolicyDsl } from "../types/policy";
import { parseAegisPolicyDsl } from "../types/policy";

export interface CreatePolicyParams {
  name: string;
  description?: string;
  dsl: AegisPolicyDsl;
}

export interface UpdatePolicyParams {
  name?: string;
  description?: string;
  status?: "active" | "disabled";
  dsl?: AegisPolicyDsl;
}

export interface PolicySummary {
  allowedActions?: Array<"swap" | "transfer">;
  maxLamportsPerTx?: string;
  allowedMints?: string[];
  maxSlippageBps?: number;
  allowedRecipients?: string[];
  blockedRecipients?: string[];
  allowedSwapPairs?: Array<{ fromMint: string; toMint: string }>;
  allowedSwapProtocols?: Array<"auto" | "jupiter" | "raydium" | "orca">;
  maxLamportsPerDayByAction?: Partial<Record<"swap" | "transfer", string>>;
  maxLamportsPerTxByAction?: Partial<Record<"swap" | "transfer", string>>;
  maxLamportsPerTxByMint?: Array<{ mint: string; lteLamports: string }>;
}

export class PolicyService {
  constructor(
    private readonly policies: PolicyRepository,
    private readonly walletBindings: WalletBindingRepository,
    private readonly walletPolicyAssignments: WalletPolicyAssignmentRepository
  ) {}

  async createPolicy(ownerAgentId: string, params: CreatePolicyParams): Promise<PolicyRecord> {
    const dsl = parseAegisPolicyDsl(params.dsl);
    return this.policies.create({
      ownerAgentId,
      name: params.name,
      description: params.description,
      dsl,
      status: "active"
    });
  }

  async getPolicy(ownerAgentId: string, policyId: string): Promise<PolicyRecord | null> {
    return this.policies.findByIdForOwner(policyId, ownerAgentId);
  }

  async listPolicies(
    ownerAgentId: string,
    options?: {
      limit?: number;
      status?: "active" | "disabled" | "archived";
      assigned?: boolean;
      assignedAgentId?: string;
    }
  ): Promise<PolicyRecord[]> {
    return this.policies.listForOwner(ownerAgentId, options);
  }

  async updatePolicy(
    ownerAgentId: string,
    policyId: string,
    params: UpdatePolicyParams
  ): Promise<PolicyRecord> {
    const existing = await this.policies.findByIdForOwner(policyId, ownerAgentId);
    if (!existing) {
      throw new Error("POLICY_NOT_FOUND");
    }
    if (existing.status === "archived") {
      throw new Error("POLICY_ARCHIVED");
    }

    const dsl = params.dsl ? parseAegisPolicyDsl(params.dsl) : undefined;
    const updated = await this.policies.updateForOwner(policyId, ownerAgentId, {
      name: params.name,
      description: params.description,
      status: params.status,
      dsl
    });
    if (!updated) {
      throw new Error("POLICY_NOT_FOUND");
    }
    return updated;
  }

  async archivePolicy(ownerAgentId: string, policyId: string): Promise<PolicyRecord> {
    const archived = await this.policies.archiveForOwner(policyId, ownerAgentId);
    if (!archived) {
      throw new Error("POLICY_NOT_FOUND");
    }
    return archived;
  }

  async assignPolicyToAgentWallet(
    ownerAgentId: string,
    agentId: string,
    policyId: string,
    options?: { priority?: number }
  ): Promise<void> {
    const wallet = await this.walletBindings.findByAgentId(agentId);
    if (!wallet) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }

    const policy = await this.policies.findByIdForOwner(policyId, ownerAgentId);
    if (!policy) {
      throw new Error("POLICY_NOT_FOUND");
    }
    if (policy.status === "archived") {
      throw new Error("POLICY_ARCHIVED");
    }

    await this.walletPolicyAssignments.assign(agentId, policyId, options);
  }

  async unassignPolicyFromAgentWallet(
    ownerAgentId: string,
    agentId: string,
    policyId: string
  ): Promise<void> {
    const wallet = await this.walletBindings.findByAgentId(agentId);
    if (!wallet) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }

    const policy = await this.policies.findByIdForOwner(policyId, ownerAgentId);
    if (!policy) {
      throw new Error("POLICY_NOT_FOUND");
    }

    await this.walletPolicyAssignments.unassign(agentId, policyId);
  }

  async listAgentWalletPolicies(agentId: string): Promise<PolicyRecord[]> {
    const assignments = await this.walletPolicyAssignments.listByAgentId(agentId);
    if (assignments.length === 0) {
      return [];
    }

    const policies = await Promise.all(
      assignments.map((assignment) => this.policies.findById(assignment.policyId))
    );

    return policies.filter((policy): policy is PolicyRecord => policy !== null);
  }

  summarizePolicy(policy: PolicyRecord): PolicySummary {
    const summary: PolicySummary = {};

    for (const rule of policy.dsl.rules) {
      switch (rule.kind) {
        case "allowed_actions":
          summary.allowedActions = rule.actions;
          break;
        case "max_lamports_per_tx":
          summary.maxLamportsPerTx = rule.lteLamports;
          break;
        case "allowed_mints":
          summary.allowedMints = rule.mints;
          break;
        case "max_slippage_bps":
          summary.maxSlippageBps = rule.lteBps;
          break;
        case "allowed_recipients":
          summary.allowedRecipients = rule.addresses;
          break;
        case "blocked_recipients":
          summary.blockedRecipients = rule.addresses;
          break;
        case "allowed_swap_pairs":
          summary.allowedSwapPairs = rule.pairs;
          break;
        case "allowed_swap_protocols":
          summary.allowedSwapProtocols = rule.protocols;
          break;
        case "max_lamports_per_day_by_action":
          summary.maxLamportsPerDayByAction = {
            ...summary.maxLamportsPerDayByAction,
            [rule.action]: rule.lteLamports
          };
          break;
        case "max_lamports_per_tx_by_action":
          summary.maxLamportsPerTxByAction = {
            ...summary.maxLamportsPerTxByAction,
            [rule.action]: rule.lteLamports
          };
          break;
        case "max_lamports_per_tx_by_mint":
          summary.maxLamportsPerTxByMint = [
            ...(summary.maxLamportsPerTxByMint ?? []),
            { mint: rule.mint, lteLamports: rule.lteLamports }
          ];
          break;
      }
    }

    return summary;
  }

  async listAgentWalletPoliciesWithAssignments(ownerAgentId: string, agentId: string) {
    const wallet = await this.walletBindings.findByAgentId(agentId);
    if (!wallet) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }
    const assignments = await this.walletPolicyAssignments.listByAgentId(agentId);
    const enriched = await Promise.all(
      assignments.map(async (assignment, index) => {
        const policy = await this.policies.findByIdForOwner(assignment.policyId, ownerAgentId);
        if (!policy) {
          return null;
        }
        return {
          effectiveOrder: index + 1,
          assignment,
          policy,
          summary: this.summarizePolicy(policy)
        };
      })
    );

    return enriched.filter((item): item is NonNullable<typeof item> => item !== null);
  }
}
