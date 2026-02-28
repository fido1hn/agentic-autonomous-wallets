import { getActiveAppContext } from "../api/appContext";

export interface WalletDescriptor {
  agentId: string;
  walletRef: string;
  walletAddress?: string;
}

export async function getOrCreateWallet(agentId: string): Promise<WalletDescriptor> {
  const { agentWalletService } = getActiveAppContext();
  const wallet = await agentWalletService.createAgentWallet(agentId);

  return {
    agentId: wallet.agentId,
    walletRef: wallet.walletRef,
    walletAddress: wallet.walletAddress
  };
}
