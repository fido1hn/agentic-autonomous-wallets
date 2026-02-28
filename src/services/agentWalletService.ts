import type {
  AgentRepository,
  ProviderName,
  WalletBindingRecord,
  WalletBindingRepository,
} from "../db/sqlite";
import { createWalletRefForAgent, getWalletMetadataByRef } from "../wallet/walletProvisioning";

export interface CreateWalletBindingResult {
  agentId: string;
  walletRef: string;
  walletAddress?: string;
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
      walletAddress?: string;
    }> = createWalletRefForAgent,
    private readonly loadWalletMetadata: (
      walletRef: string
    ) => Promise<{
      provider: ProviderName;
      walletRef: string;
      walletAddress?: string;
    }> = getWalletMetadataByRef,
  ) {}

  async createAgentWallet(agentId: string): Promise<CreateWalletBindingResult> {
    const agent = await this.agents.findById(agentId);
    if (!agent) {
      throw new Error("AGENT_NOT_FOUND");
    }

    const existing = await this.walletBindings.findByAgentId(agentId);
    if (existing) {
      if (existing.walletAddress) {
        return existing;
      }

      const hydrated = await this.loadWalletMetadata(existing.walletRef);
      return this.walletBindings.upsert({
        agentId,
        walletRef: existing.walletRef,
        walletAddress: hydrated.walletAddress,
        provider: existing.provider,
      });
    }

    const { provider, walletRef, walletAddress } = await this.provisionWalletRef(agentId);

    return this.walletBindings.upsert({
      agentId,
      walletRef,
      walletAddress,
      provider,
    });
  }

  async getAgentWallet(agentId: string): Promise<WalletBindingRecord> {
    const binding = await this.walletBindings.findByAgentId(agentId);
    if (!binding) {
      throw new Error("AGENT_WALLET_NOT_FOUND");
    }

    if (binding.walletAddress) {
      return binding;
    }

    const hydrated = await this.loadWalletMetadata(binding.walletRef);
    return this.walletBindings.upsert({
      agentId,
      walletRef: binding.walletRef,
      walletAddress: hydrated.walletAddress,
      provider: binding.provider,
    });
  }
}
