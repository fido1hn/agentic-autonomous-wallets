import type { SerializedTransaction, SignatureResult } from "../types/intents";
import { privyProvider } from "../wallet/privyProvider";

export type WalletProviderName = "privy";

export interface WalletProvider {
  name: WalletProviderName;
  signAndSend(params: {
    agentId: string;
    walletRef?: string;
    serializedTx: SerializedTransaction;
  }): Promise<SignatureResult>;
}

export function getWalletProvider(): WalletProvider {
  return privyProvider;
}
