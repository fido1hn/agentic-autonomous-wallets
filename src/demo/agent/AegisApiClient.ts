import type {
  AegisApiErrorPayload,
  CreateAgentRequest,
  CreateAgentResponse,
  WalletBindingResponse,
} from "./types";

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

