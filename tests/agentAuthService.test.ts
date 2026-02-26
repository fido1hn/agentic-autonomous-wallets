import { describe, expect, it } from "bun:test";
import { createRepositories, connectSqlite } from "../src/db/sqlite";
import { AgentAuthService } from "../src/services/agentAuthService";
import { AgentService } from "../src/services/agentService";
import { initSqliteSchema } from "./helpers/initSqliteSchema";

describe("AgentAuthService", () => {
  it("issues and verifies agent API keys", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const agentService = new AgentService(repos.agents);
      const authService = new AgentAuthService(repos.agents, repos.agentApiKeys);

      const agent = await agentService.createAgent({ name: "agent-api-01" });
      const issued = await authService.issueKey(agent.id);

      expect(issued.apiKey.startsWith("aegis_sk_")).toBe(true);
      expect(await authService.verify(agent.id, issued.apiKey)).toBe(true);
      expect(await authService.verify(agent.id, `${issued.apiKey}_invalid`)).toBe(false);
    } finally {
      ctx.client.close();
    }
  });

  it("rotates old keys when issuing a new one", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const agentService = new AgentService(repos.agents);
      const authService = new AgentAuthService(repos.agents, repos.agentApiKeys);

      const agent = await agentService.createAgent({ name: "agent-api-02" });
      const first = await authService.issueKey(agent.id);
      const second = await authService.issueKey(agent.id);

      expect(await authService.verify(agent.id, first.apiKey)).toBe(false);
      expect(await authService.verify(agent.id, second.apiKey)).toBe(true);
    } finally {
      ctx.client.close();
    }
  });
});
