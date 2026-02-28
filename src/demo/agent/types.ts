export interface CreateAgentRequest {
  name: string;
  status?: "active" | "paused";
}

export interface CreateAgentResponse {
  agentId: string;
  name: string;
  status: "active" | "paused";
  apiKey: string;
}

export interface WalletBindingResponse {
  agentId: string;
  walletRef: string;
  walletAddress?: string;
  provider: "privy";
  updatedAt: string;
}

export interface WalletBalanceToken {
  mint: string;
  amountAtomic: string;
  decimals: number;
  uiAmount: string;
  ata: string;
}

export interface WalletBalancesResponse {
  agentId: string;
  walletAddress: string;
  native: {
    lamports: string;
    sol: string;
  };
  tokens: WalletBalanceToken[];
  slot: number;
}

export interface ExecutionIntentRequest {
  agentId: string;
  action: "swap" | "transfer";
  amountAtomic: string;
  idempotencyKey?: string;
  walletAddress?: string;
  fromMint?: string;
  toMint?: string;
  maxSlippageBps?: number;
  transferAsset?: "native" | "spl";
  recipientAddress?: string;
  mintAddress?: string;
}

export type ExecutionResultResponse =
  | {
      status: "approved";
      provider: "privy";
      txSignature: string;
      policyChecks: string[];
    }
  | {
      status: "rejected";
      reasonCode: string;
      reasonDetail?: string;
      policyChecks?: string[];
    };

export interface AgentSession {
  name: string;
  agentId?: string;
  apiKey?: string;
  walletRef?: string;
  walletAddress?: string;
  provider?: "privy";
  walletUpdatedAt?: string;
}

export interface AegisApiErrorPayload {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
