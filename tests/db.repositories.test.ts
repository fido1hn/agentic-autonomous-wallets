import { describe, expect, it } from "bun:test";
import {
  connectSqlite,
  createRepositories,
  type CreateAgentInput,
  type CreateExecutionLogInput
} from "../src/db/sqlite.ts";
import { initSqliteSchema } from "./helpers/initSqliteSchema";

describe("db repositories", () => {
  it("creates and loads an agent record", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);

      const agentInput: CreateAgentInput = {
        name: "agent-mm-01",
        status: "active"
      };

      const created = await repos.agents.create(agentInput);
      const loaded = await repos.agents.findById(created.id);

      expect(loaded).toEqual(created);
      expect(loaded?.name).toBe("agent-mm-01");
    } finally {
      ctx.client.close();
    }
  });

  it("binds a wallet to an agent and resolves it", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);

      const agent = await repos.agents.create({ name: "agent-mm-01", status: "active" });

      const binding = await repos.walletBindings.upsert({
        agentId: agent.id,
        walletRef: "wallet_agent-mm-01",
        provider: "privy"
      });

      const loaded = await repos.walletBindings.findByAgentId(agent.id);

      expect(loaded).toEqual(binding);
      expect(loaded?.provider).toBe("privy");
    } finally {
      ctx.client.close();
    }
  });

  it("appends execution logs with approve and reject states", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);

      const agent = await repos.agents.create({ name: "agent-mm-01", status: "active" });

      const approvedInput: CreateExecutionLogInput = {
        agentId: agent.id,
        status: "approved",
        reasonCode: undefined,
        provider: "privy",
        txSignature: "sig_approved",
        policyChecks: ["max_per_tx", "daily_cap"]
      };

      const rejectedInput: CreateExecutionLogInput = {
        agentId: agent.id,
        status: "rejected",
        reasonCode: "POLICY_MAX_PER_TX_EXCEEDED",
        provider: undefined,
        txSignature: undefined,
        policyChecks: ["max_per_tx"]
      };

      await repos.executionLogs.append(approvedInput);
      await repos.executionLogs.append(rejectedInput);

      const logs = await repos.executionLogs.listByAgentId(agent.id);

      expect(logs).toHaveLength(2);
      expect(logs[0]?.status).toBe("rejected");
      expect(logs[1]?.status).toBe("approved");
      expect(logs[0]?.reasonCode).toBe("POLICY_MAX_PER_TX_EXCEEDED");
    } finally {
      ctx.client.close();
    }
  });

  it("atomically accumulates daily spend for the same agent/day", async () => {
    const ctx = connectSqlite(":memory:");
    initSqliteSchema(ctx.client);

    try {
      const repos = createRepositories(ctx.db);
      const agent = await repos.agents.create({ name: "agent-mm-02", status: "active" });
      const dayKey = "2026-02-26";

      await repos.dailySpendCounters.addSpend(agent.id, dayKey, "1000");
      const second = await repos.dailySpendCounters.addSpend(agent.id, dayKey, "2500");

      expect(second.spentLamports).toBe("3500");

      const loaded = await repos.dailySpendCounters.getByAgentAndDay(agent.id, dayKey);
      expect(loaded?.spentLamports).toBe("3500");
    } finally {
      ctx.client.close();
    }
  });
});
