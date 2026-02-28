import { afterEach, describe, expect, it } from "bun:test";
import type { AppContext } from "../src/api/appContext";
import { clearActiveAppContext, setActiveAppContextForTests } from "../src/api/appContext";
import { routeIntent } from "../src/core/intentRouter";
import { connectSqlite, runDrizzleMigrations, type SqliteContext } from "../src/db/sqlite";
import { AgentAuthService } from "../src/services/agentAuthService";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { PolicyService } from "../src/services/policyService";

describe("routeIntent idempotency", () => {
  let db: SqliteContext | null = null;

  afterEach(() => {
    clearActiveAppContext();
    if (db) {
      db.client.close();
      db = null;
    }
  });

  async function setupContext() {
    db = connectSqlite(":memory:");
    runDrizzleMigrations(db.db);

    const agentService = new AgentService(db.repositories.agents);
    const agentWalletService = new AgentWalletService(
      db.repositories.agents,
      db.repositories.walletBindings
    );
    const agentAuthService = new AgentAuthService(db.repositories.agents, db.repositories.agentApiKeys);
    const policyService = new PolicyService(
      db.repositories.policies,
      db.repositories.walletBindings,
      db.repositories.walletPolicyAssignments
    );

    const context: AppContext = {
      db,
      dbPath: ":memory:",
      agentService,
      agentWalletService,
      agentAuthService,
      policyService
    };
    setActiveAppContextForTests(context);
    return { agentService, policyService };
  }

  it("returns stored result for repeated idempotency key and avoids duplicate logs", async () => {
    const { agentService, policyService } = await setupContext();
    const agent = await agentService.createAgent({ name: "idem-agent" });
    await db!.repositories.walletBindings.upsert({
      agentId: agent.id,
      walletRef: "wallet_idem_1",
      walletAddress: "solana_address_idem_1",
      provider: "privy"
    });

    const restrictive = await policyService.createPolicy(agent.id, {
      name: "Swap only",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });
    await policyService.assignPolicyToAgentWallet(agent.id, agent.id, restrictive.id);

    const intent = {
      agentId: agent.id,
      action: "transfer" as const,
      amountAtomic: "1000",
      idempotencyKey: "idem-001"
    };

    const first = await routeIntent(intent);
    const second = await routeIntent(intent);

    expect(first.status).toBe("rejected");
    if (first.status === "rejected") {
      expect(first.policyMatch?.ruleKind).toBe("allowed_actions");
    }
    expect(second).toEqual(first);

    const logs = await db!.repositories.executionLogs.listByAgentId(agent.id);
    expect(logs.length).toBe(1);
    const idem = await db!.repositories.intentIdempotency.find(agent.id, "idem-001");
    expect(idem?.resultJson.length).toBeGreaterThan(0);
  });

  it("preserves v2 policyMatch across idempotent replay", async () => {
    const { agentService, policyService } = await setupContext();
    const agent = await agentService.createAgent({ name: "idem-agent-v2" });
    await db!.repositories.walletBindings.upsert({
      agentId: agent.id,
      walletRef: "wallet_idem_2",
      walletAddress: "solana_address_idem_2",
      provider: "privy"
    });

    const restrictive = await policyService.createPolicy(agent.id, {
      name: "Daily transfer cap",
      dsl: {
        version: "aegis.policy.v2",
        rules: [{ kind: "max_lamports_per_day_by_action", action: "transfer", lteLamports: "500" }]
      }
    });
    await policyService.assignPolicyToAgentWallet(agent.id, agent.id, restrictive.id);
    await db!.repositories.dailyActionSpendCounters.addSpend(agent.id, "2026-02-28", "transfer", "450");

    const realDateToISOString = Date.prototype.toISOString;
    Date.prototype.toISOString = function () {
      return "2026-02-28T12:00:00.000Z";
    };

    try {
      const intent = {
        agentId: agent.id,
        action: "transfer" as const,
        transferAsset: "native" as const,
        recipientAddress: "recipient-v2",
        amountAtomic: "100",
        idempotencyKey: "idem-v2-001"
      };

      const first = await routeIntent(intent);
      const second = await routeIntent(intent);

      expect(first.status).toBe("rejected");
      if (first.status === "rejected") {
        expect(first.policyMatch?.ruleKind).toBe("max_lamports_per_day_by_action");
      }
      expect(second).toEqual(first);
    } finally {
      Date.prototype.toISOString = realDateToISOString;
    }
  });
});
