import type { WalletProvider } from "../core/walletProvider";

export class SignerEngine {
  constructor(private readonly provider: WalletProvider) {}

  getProviderName(): string {
    return this.provider.name;
  }

  async signAndSend(params: { agentId: string; walletRef?: string; serializedTx: string }) {
    return this.provider.signAndSend(params);
  }
}
