import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../src/api/appContext";
import { clearActiveAppContext, setActiveAppContextForTests } from "../src/api/appContext";
import { balancesRoutes } from "../src/api/routes/balances";
import { connectSqlite, runDrizzleMigrations, type SqliteContext } from "../src/db/sqlite";
import { setSolanaReadConnectionFactoryForTests } from "../src/protocols/solanaReadAdapter";
import { AgentAuthService } from "../src/services/agentAuthService";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { PolicyService } from "../src/services/policyService";

describe("balances routes", () => {
  let db: SqliteContext | null = null;

  afterEach(() => {
    setSolanaReadConnectionFactoryForTests(null);
    clearActiveAppContext();
    if (db) {
      db.client.close();
      db = null;
    }
  });

  async function setup() {
    db = connectSqlite(":memory:");
    runDrizzleMigrations(db.db);

    const agentService = new AgentService(db.repositories.agents);
    const agentWalletService = new AgentWalletService(db.repositories.agents, db.repositories.walletBindings);
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

    const app = new Hono();
    app.route("/", balancesRoutes);

    const agent = await agentService.createAgent({ name: "balance-api-agent" });
    const { apiKey } = await agentAuthService.issueKey(agent.id);

    return { app, agent, apiKey };
  }

  it("returns native and token balances", async () => {
    const { app, agent, apiKey } = await setup();
    await db!.repositories.walletBindings.upsert({
      agentId: agent.id,
      walletRef: "wallet_bal_1",
      walletAddress: "7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS",
      provider: "privy"
    });
    setSolanaReadConnectionFactoryForTests(
      () =>
        ({
          getBalanceAndContext: async () => ({
            context: { slot: 7 },
            value: 1234
          }),
          getParsedTokenAccountsByOwner: async () => ({
            context: { slot: 9 },
            value: []
          })
        }) as any
    );

    const res = await app.request(`http://localhost/agents/${agent.id}/balances`, {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { agentId: string; walletAddress: string; native: { lamports: string } };
    expect(body.agentId).toBe(agent.id);
    expect(body.walletAddress).toBe("7YttLkH4kKo3aonMh8M73PvvrLpzjAU6RzG32KzBSSMS");
    expect(body.native.lamports).toBe("1234");
  });

  it("returns 404 when wallet is missing", async () => {
    const { app, agent, apiKey } = await setup();

    const res = await app.request(`http://localhost/agents/${agent.id}/balances`, {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });

    expect(res.status).toBe(404);
  });
});
