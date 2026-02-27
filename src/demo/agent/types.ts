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
  provider: "privy";
  updatedAt: string;
}

export interface AgentSession {
  name: string;
  agentId?: string;
  apiKey?: string;
  walletRef?: string;
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

