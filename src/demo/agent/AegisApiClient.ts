import type {
  AegisApiErrorPayload,
  CreateAgentRequest,
  CreateAgentResponse,
  ExecutionIntentRequest,
  ExecutionResultResponse,
  PolicyAssignmentResponse,
  PolicyDetailResponse,
  PolicyListResponse,
  PolicyRecordResponse,
  PolicyUpdateRequest,
  SwapTokensInput,
  WalletBalancesResponse,
  WalletBindingResponse,
} from "./types";
import { requireResolvedToken } from "../../protocols/tokenResolver";

export class AegisApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "AegisApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class AegisApiClient {
  constructor(private readonly baseUrl: string) {}

  async createAgent(input: CreateAgentRequest): Promise<CreateAgentResponse> {
    return this.request<CreateAgentResponse>("/agents", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async createWallet(agentId: string, apiKey: string): Promise<WalletBindingResponse> {
    return this.request<WalletBindingResponse>(`/agents/${agentId}/wallet`, {
      method: "POST",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async getWallet(agentId: string, apiKey: string): Promise<WalletBindingResponse> {
    return this.request<WalletBindingResponse>(`/agents/${agentId}/wallet`, {
      method: "GET",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async getBalances(agentId: string, apiKey: string): Promise<WalletBalancesResponse> {
    return this.request<WalletBalancesResponse>(`/agents/${agentId}/balances`, {
      method: "GET",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async executeIntent(agentId: string, apiKey: string, intent: ExecutionIntentRequest): Promise<ExecutionResultResponse> {
    return this.request<ExecutionResultResponse>("/intents/execute", {
      method: "POST",
      headers: this.authHeaders(agentId, apiKey),
      body: JSON.stringify(intent),
    });
  }

  async createPolicy(
    agentId: string,
    apiKey: string,
    input: { name: string; description?: string; dsl: Record<string, unknown> }
  ): Promise<PolicyRecordResponse> {
    return this.request<PolicyRecordResponse>("/policies", {
      method: "POST",
      headers: this.authHeaders(agentId, apiKey),
      body: JSON.stringify(input),
    });
  }

  async getPolicies(
    agentId: string,
    apiKey: string,
    options?: { status?: "active" | "disabled" | "archived"; assigned?: boolean; limit?: number }
  ): Promise<PolicyListResponse> {
    const query = new URLSearchParams();
    if (options?.status) query.set("status", options.status);
    if (options?.assigned !== undefined) query.set("assigned", String(options.assigned));
    if (options?.limit !== undefined) query.set("limit", String(options.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.request<PolicyListResponse>(`/policies${suffix}`, {
      method: "GET",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async getPolicy(agentId: string, apiKey: string, policyId: string): Promise<PolicyDetailResponse> {
    return this.request<PolicyDetailResponse>(`/policies/${policyId}`, {
      method: "GET",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async updatePolicy(
    agentId: string,
    apiKey: string,
    policyId: string,
    input: PolicyUpdateRequest
  ): Promise<PolicyRecordResponse> {
    return this.request<PolicyRecordResponse>(`/policies/${policyId}`, {
      method: "PATCH",
      headers: this.authHeaders(agentId, apiKey),
      body: JSON.stringify(input),
    });
  }

  async archivePolicy(agentId: string, apiKey: string, policyId: string): Promise<{ id: string; status: "archived" }> {
    return this.request<{ id: string; status: "archived" }>(`/policies/${policyId}`, {
      method: "DELETE",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async assignPolicy(
    agentId: string,
    apiKey: string,
    policyId: string,
    input?: { priority?: number }
  ): Promise<{ agentId: string; policyId: string; status: "assigned" }> {
    return this.request<{ agentId: string; policyId: string; status: "assigned" }>(
      `/agents/${agentId}/policies/${policyId}`,
      {
        method: "POST",
        headers: this.authHeaders(agentId, apiKey),
        body: JSON.stringify(input ?? {}),
      }
    );
  }

  async unassignPolicy(
    agentId: string,
    apiKey: string,
    policyId: string
  ): Promise<{ agentId: string; policyId: string; status: "unassigned" }> {
    return this.request<{ agentId: string; policyId: string; status: "unassigned" }>(
      `/agents/${agentId}/policies/${policyId}`,
      {
        method: "DELETE",
        headers: this.authHeaders(agentId, apiKey),
      }
    );
  }

  async getWalletPolicies(agentId: string, apiKey: string): Promise<PolicyAssignmentResponse> {
    return this.request<PolicyAssignmentResponse>(`/agents/${agentId}/policies`, {
      method: "GET",
      headers: this.authHeaders(agentId, apiKey),
    });
  }

  async transferSol(
    agentId: string,
    apiKey: string,
    input: {
      recipientAddress: string;
      amountLamports: string;
      idempotencyKey?: string;
    }
  ): Promise<ExecutionResultResponse> {
    return this.executeIntent(agentId, apiKey, {
      agentId,
      action: "transfer",
      transferAsset: "native",
      recipientAddress: input.recipientAddress,
      amountAtomic: input.amountLamports,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async transferSpl(
    agentId: string,
    apiKey: string,
    input: {
      recipientAddress: string;
      mintAddress: string;
      amountAtomic: string;
      idempotencyKey?: string;
    }
  ): Promise<ExecutionResultResponse> {
    return this.executeIntent(agentId, apiKey, {
      agentId,
      action: "transfer",
      transferAsset: "spl",
      recipientAddress: input.recipientAddress,
      mintAddress: input.mintAddress,
      amountAtomic: input.amountAtomic,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async swapTokens(
    agentId: string,
    apiKey: string,
    input: SwapTokensInput
  ): Promise<ExecutionResultResponse> {
    const protocol = input.protocol ?? "auto";
    const fromToken = requireResolvedToken({ symbolOrMint: input.fromToken, protocol });
    const toToken = requireResolvedToken({ symbolOrMint: input.toToken, protocol });

    return this.executeIntent(agentId, apiKey, {
      agentId,
      action: "swap",
      swapProtocol: protocol,
      fromMint: fromToken.mint,
      toMint: toToken.mint,
      amountAtomic: input.amountLamports,
      maxSlippageBps: input.maxSlippageBps,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private authHeaders(agentId: string, apiKey: string): Record<string, string> {
    return {
      "x-agent-id": agentId,
      "x-agent-api-key": apiKey,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const raw = await response.text();
    const body = this.tryParseJson(raw);

    if (!response.ok) {
      const payload = (body ?? null) as AegisApiErrorPayload | null;
      const code = payload?.error?.code ?? "HTTP_ERROR";
      const message = payload?.error?.message ?? `Request failed with status ${response.status}`;
      const requestId = payload?.error?.requestId;
      throw new AegisApiError(response.status, code, message, requestId);
    }

    return (body ?? {}) as T;
  }

  private tryParseJson(input: string): unknown | null {
    if (!input || input.trim() === "") {
      return null;
    }
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
}
