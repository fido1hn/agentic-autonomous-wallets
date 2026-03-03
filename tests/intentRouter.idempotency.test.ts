import { afterEach, describe, expect, it } from "bun:test";
import type { AppContext } from "../src/api/appContext";
import { clearActiveAppContext, setActiveAppContextForTests } from "../src/api/appContext";
import { setWalletProviderForTests, type WalletProvider } from "../src/core/walletProvider";
import { setSimulateSerializedTransactionForTests } from "../src/core/policyEngine";
import { routeIntent } from "../src/core/intentRouter";
import { connectSqlite, runDrizzleMigrations, type SqliteContext } from "../src/db/sqlite";
import { setSolanaTransferConnectionFactoryForTests } from "../src/protocols/solanaTransferAdapter";
import { setBroadcastSignedTransactionForTests } from "../src/wallet/privyProvider";
import { AgentAuthService } from "../src/services/agentAuthService";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { IntentExecutionService } from "../src/services/intentExecutionService";
import { PolicyService } from "../src/services/policyService";

describe("routeIntent idempotency", () => {
  let db: SqliteContext | null = null;

  afterEach(() => {
    setWalletProviderForTests(null);
    setSimulateSerializedTransactionForTests(null);
    setSolanaTransferConnectionFactoryForTests(null);
    setBroadcastSignedTransactionForTests(null);
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
    const intentExecutionService = new IntentExecutionService(db, agentWalletService, policyService);

    const context: AppContext = {
      db,
      dbPath: ":memory:",
      agentService,
      agentWalletService,
      agentAuthService,
      policyService,
      intentExecutionService
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
    const execution = await db!.repositories.intentExecutions.findByAgentAndIdempotencyKey(agent.id, "idem-001");
    expect(execution?.result).toBeDefined();
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

  it("waits on duplicate in-flight execution and returns the same final result", async () => {
    const { agentService } = await setupContext();
    const agent = await agentService.createAgent({ name: "idem-agent-wait" });
    await db!.repositories.walletBindings.upsert({
      agentId: agent.id,
      walletRef: "wallet_wait_1",
      walletAddress: "7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS",
      provider: "privy"
    });
    setSolanaTransferConnectionFactoryForTests(
      () =>
        ({
          getLatestBlockhash: async () => ({
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 1
          })
        }) as any
    );
    setSimulateSerializedTransactionForTests(async () => {});

    let releaseProvider: (() => void) | null = null;
    let providerCalls = 0;
    const provider: WalletProvider = {
      name: "privy",
      async signAndSend() {
        providerCalls += 1;
        await new Promise<void>((resolve) => {
          releaseProvider = resolve;
        });
        return {
          provider: "privy",
          txSignature: "sig_wait_001",
          txSignatures: ["sig_wait_001"]
        };
      }
    };
    setWalletProviderForTests(provider);

    const intent = {
      agentId: agent.id,
      action: "transfer" as const,
      transferAsset: "native" as const,
      recipientAddress: "6iQv3Lxw9Q5XV1fV64D7Bqjofu5pY88MtXgFp16psNTJ",
      amountAtomic: "100",
      idempotencyKey: "idem-wait-001"
    };

    const firstPromise = routeIntent(intent);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const secondPromise = routeIntent(intent);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(providerCalls).toBe(1);
    if (!releaseProvider) {
      throw new Error("Expected provider release callback to be set");
    }
    const release = releaseProvider as unknown as () => void;
    release();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.status).toBe("approved");
    expect(second).toEqual(first);
    expect(providerCalls).toBe(1);
  });

  it("finalizes a broadcast execution on retry without double-counting spend", async () => {
    const { agentService } = await setupContext();
    const agent = await agentService.createAgent({ name: "idem-agent-broadcast" });

    const execution = await db!.repositories.intentExecutions.createReceived({
      agentId: agent.id,
      idempotencyKey: "idem-broadcast-001",
      action: "swap",
      intent: {
        agentId: agent.id,
        action: "swap",
        fromMint: "So11111111111111111111111111111111111111112",
        toMint: "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
        amountAtomic: "200000000",
        maxSlippageBps: 100,
        idempotencyKey: "idem-broadcast-001"
      }
    });

    await db!.repositories.intentExecutions.transitionToBroadcast(execution.id, {
      expectedStatus: "received",
      currentStep: "persist_post_broadcast_effects",
      walletRef: "wallet_broadcast_1",
      walletAddress: "broadcast_wallet_address",
      provider: "privy",
      txSignature: "sig_broadcast_001",
      txSignatures: ["sig_broadcast_001"],
      policyChecks: ["assigned_policies:none", "rpc_simulation"]
    });

    const result = await routeIntent({
      agentId: agent.id,
      action: "swap",
      fromMint: "So11111111111111111111111111111111111111112",
      toMint: "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
      amountAtomic: "200000000",
      maxSlippageBps: 100,
      idempotencyKey: "idem-broadcast-001"
    });

    expect(result.status).toBe("approved");
    if (result.status === "approved") {
      expect(result.txSignature).toBe("sig_broadcast_001");
    }

    const updated = await db!.repositories.intentExecutions.findById(execution.id);
    expect(updated?.status).toBe("finalized");

    const dayKey = new Date().toISOString().slice(0, 10);
    const spend = await db!.repositories.dailySpendCounters.getByAgentAndDay(agent.id, dayKey);
    expect(spend?.spentLamports).toBe("200000000");

    const logs = await db!.repositories.executionLogs.listByAgentId(agent.id);
    expect(logs.length).toBe(1);
  });
});
