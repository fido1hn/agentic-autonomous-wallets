import { describe, expect, it } from "bun:test";
import { createRepositories, connectSqlite } from "../src/db/sqlite";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { initSqliteSchema } from "./helpers/initSqliteSchema";

describe("AgentWalletService", () => {
  it("creates wallet binding for an existing agent", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const agentService = new AgentService(repos.agents);
      const walletService = new AgentWalletService(
        repos.agents,
        repos.walletBindings,
        async (agentId) => ({ provider: "privy", walletRef: `privy_wallet_${agentId}` })
      );

      const agent = await agentService.createAgent({ name: "agent-mm-01" });
      const binding = await walletService.createAgentWallet(agent.id);

      expect(binding.agentId).toBe(agent.id);
      expect(binding.provider).toBe("privy");
      expect(binding.walletRef.startsWith("privy_wallet_")).toBe(true);
    } finally {
      ctx.client.close();
    }
  });

  it("reuses existing wallet binding when called again", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const agent = await repos.agents.create({ name: "agent-mm-01", status: "active" });
      const walletService = new AgentWalletService(
        repos.agents,
        repos.walletBindings,
        async (agentId) => ({ provider: "privy", walletRef: `privy_wallet_${agentId}` })
      );

      const first = await walletService.createAgentWallet(agent.id);
      const second = await walletService.createAgentWallet(agent.id);

      expect(second.walletRef).toBe(first.walletRef);

      const loaded = await repos.walletBindings.findByAgentId(agent.id);
      expect(loaded?.walletRef).toBe(first.walletRef);
    } finally {
      ctx.client.close();
    }
  });

  it("throws when agent does not exist", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const walletService = new AgentWalletService(repos.agents, repos.walletBindings);

      await expect(walletService.createAgentWallet("agt_missing")).rejects.toThrow("AGENT_NOT_FOUND");
    } finally {
      ctx.client.close();
    }
  });
});
