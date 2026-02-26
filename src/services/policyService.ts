import type {
  PolicyRecord,
  PolicyRepository,
  WalletBindingRepository,
  WalletPolicyAssignmentRepository
} from "../db/sqlite";
import type { AegisPolicyDslV1 } from "../types/policy";
import { parseAegisPolicyDslV1 } from "../types/policy";

export interface CreatePolicyParams {
  name: string;
  description?: string;
  dsl: AegisPolicyDslV1;
}

export class PolicyService {
  constructor(
    private readonly policies: PolicyRepository,
    private readonly walletBindings: WalletBindingRepository,
    private readonly walletPolicyAssignments: WalletPolicyAssignmentRepository
  ) {}

  async createPolicy(params: CreatePolicyParams): Promise<PolicyRecord> {
    const dsl = parseAegisPolicyDslV1(params.dsl);
    return this.policies.create({
      name: params.name,
      description: params.description,
      dsl,
      status: "active"
    });
  }

  async assignPolicyToAgentWallet(agentId: string, policyId: string): Promise<void> {
    const wallet = await this.walletBindings.findByAgentId(agentId);
    if (!wallet) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }

    const policy = await this.policies.findById(policyId);
    if (!policy) {
      throw new Error("POLICY_NOT_FOUND");
    }

    await this.walletPolicyAssignments.assign(agentId, policyId);
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
}
