import type {
  AgentRepository,
  ProviderName,
  WalletBindingRecord,
  WalletBindingRepository,
} from "../db/sqlite";
import { createWalletRefForAgent } from "../wallet/walletProvisioning";

export interface CreateWalletBindingResult {
  agentId: string;
  walletRef: string;
  provider: ProviderName;
}

export class AgentWalletService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly walletBindings: WalletBindingRepository,
    private readonly provisionWalletRef: (
      agentId: string,
    ) => Promise<{
      provider: ProviderName;
      walletRef: string;
    }> = createWalletRefForAgent,
  ) {}

  async createAgentWallet(agentId: string): Promise<CreateWalletBindingResult> {
    const agent = await this.agents.findById(agentId);
    if (!agent) {
      throw new Error("AGENT_NOT_FOUND");
    }

    const existing = await this.walletBindings.findByAgentId(agentId);
    if (existing) {
      return existing;
    }

    const { provider, walletRef } = await this.provisionWalletRef(agentId);

    return this.walletBindings.upsert({
      agentId,
      walletRef,
      provider,
    });
  }

  async getAgentWallet(agentId: string): Promise<WalletBindingRecord> {
    const binding = await this.walletBindings.findByAgentId(agentId);
    if (!binding) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }
    return binding;
  }
}
