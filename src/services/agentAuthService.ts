import { createHash, randomBytes } from "node:crypto";
import type { AgentApiKeyRepository, AgentRepository } from "../db/sqlite";

export interface IssueAgentApiKeyResult {
  apiKey: string;
  keyId: string;
}

function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function createApiKey(): string {
  return `aegis_sk_${randomBytes(32).toString("base64url")}`;
}

export class AgentAuthService {
  constructor(
    private readonly agents: AgentRepository,
    private readonly agentApiKeys: AgentApiKeyRepository
  ) {}

  async issueKey(agentId: string): Promise<IssueAgentApiKeyResult> {
    const agent = await this.agents.findById(agentId);
    if (!agent) {
      throw new Error("AGENT_NOT_FOUND");
    }

    const apiKey = createApiKey();
    const keyHash = hashApiKey(apiKey);

    await this.agentApiKeys.revokeByAgentId(agentId);
    const created = await this.agentApiKeys.create({
      agentId,
      keyHash
    });

    return { apiKey, keyId: created.id };
  }

  async verify(agentId: string, plaintextApiKey: string): Promise<boolean> {
    const active = await this.agentApiKeys.findActiveByAgentId(agentId);
    if (!active) {
      return false;
    }

    const candidateHash = hashApiKey(plaintextApiKey);
    const valid = active.keyHash === candidateHash;
    if (valid) {
      await this.agentApiKeys.touchLastUsed(active.id);
    }
    return valid;
  }
}
