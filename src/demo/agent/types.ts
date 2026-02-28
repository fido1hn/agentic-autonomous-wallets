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
  swapProtocol?: "auto" | "jupiter" | "raydium" | "orca";
  fromMint?: string;
  toMint?: string;
  maxSlippageBps?: number;
  transferAsset?: "native" | "spl";
  recipientAddress?: string;
  mintAddress?: string;
}

export interface SwapTokensInput {
  protocol?: "auto" | "jupiter" | "raydium" | "orca";
  fromToken: string;
  toToken: string;
  amountLamports: string;
  maxSlippageBps?: number;
  idempotencyKey?: string;
}

export type ExecutionResultResponse =
  | {
      status: "approved";
      provider: "privy";
      txSignature: string;
      txSignatures?: string[];
      policyChecks: string[];
    }
  | {
      status: "rejected";
      reasonCode: string;
      reasonDetail?: string;
      policyChecks?: string[];
      policyMatch?: {
        policyId: string;
        policyName?: string;
        ruleKind:
          | "allowed_actions"
          | "max_lamports_per_tx"
          | "allowed_mints"
          | "max_slippage_bps"
          | "allowed_recipients"
          | "blocked_recipients"
          | "allowed_swap_pairs"
          | "allowed_swap_protocols"
          | "max_lamports_per_day_by_action"
          | "max_lamports_per_tx_by_action"
          | "max_lamports_per_tx_by_mint";
        ruleConfig: Record<string, unknown>;
      };
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

export interface PolicyRecordResponse {
  id: string;
  ownerAgentId?: string;
  name: string;
  description?: string | null;
  status: "active" | "disabled" | "archived";
  dsl: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PolicySummaryResponse {
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

export interface PolicyDetailResponse extends PolicyRecordResponse {
  assignment: {
    assignedToAgentWallet: boolean;
    priority?: number;
  };
}

export interface PolicyAssignmentResponse {
  agentId: string;
  count: number;
  data: Array<{
    effectiveOrder: number;
    assignment: {
      id: string;
      agentId: string;
      policyId: string;
      priority: number;
      createdAt: string;
    };
    policy: PolicyRecordResponse;
    summary: PolicySummaryResponse;
  }>;
}

export interface PolicyListResponse {
  count: number;
  data: PolicyRecordResponse[];
}

export interface PolicyUpdateRequest {
  name?: string;
  description?: string;
  status?: "active" | "disabled";
  dsl?: Record<string, unknown>;
}
