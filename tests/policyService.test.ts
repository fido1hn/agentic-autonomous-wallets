import { afterEach, describe, expect, it } from "bun:test";
import { connectSqlite, runDrizzleMigrations, type SqliteContext } from "../src/db/sqlite";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { PolicyService } from "../src/services/policyService";

describe("PolicyService", () => {
  let db: SqliteContext | null = null;

  afterEach(() => {
    if (db) {
      db.client.close();
      db = null;
    }
  });

  function createServices() {
    db = connectSqlite(":memory:");
    runDrizzleMigrations(db.db);

    const agentService = new AgentService(db.repositories.agents);
    const agentWalletService = new AgentWalletService(
      db.repositories.agents,
      db.repositories.walletBindings,
      async (agentId) => ({ provider: "privy", walletRef: `wallet_${agentId}` })
    );
    const policyService = new PolicyService(
      db.repositories.policies,
      db.repositories.walletBindings,
      db.repositories.walletPolicyAssignments
    );

    return { agentService, agentWalletService, policyService };
  }

  it("creates an active policy with DSL v1", async () => {
    const { policyService } = createServices();

    const policy = await policyService.createPolicy({
      name: "Conservative Swap Policy",
      dsl: {
        version: "aegis.policy.v1",
        rules: [
          { kind: "allowed_actions", actions: ["swap"] },
          { kind: "max_lamports_per_tx", lteLamports: "1000000" }
        ]
      }
    });

    expect(policy.id.length).toBeGreaterThan(0);
    expect(policy.status).toBe("active");
    expect(policy.dsl.version).toBe("aegis.policy.v1");
    expect(policy.dsl.rules.length).toBe(2);
  });

  it("assigns policy to an agent wallet and lists effective policies", async () => {
    const { agentService, agentWalletService, policyService } = createServices();
    const agent = await agentService.createAgent({ name: "policy-agent" });
    await agentWalletService.createAgentWallet(agent.id);

    const policy = await policyService.createPolicy({
      name: "Swap Guardrails",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });

    await policyService.assignPolicyToAgentWallet(agent.id, policy.id);
    const assigned = await policyService.listAgentWalletPolicies(agent.id);

    expect(assigned.length).toBe(1);
    expect(assigned[0]?.id).toBe(policy.id);
  });

  it("rejects policy assignment when wallet has not been created", async () => {
    const { agentService, policyService } = createServices();
    const agent = await agentService.createAgent({ name: "no-wallet-agent" });
    const policy = await policyService.createPolicy({
      name: "Any",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap", "transfer"] }]
      }
    });

    await expect(policyService.assignPolicyToAgentWallet(agent.id, policy.id)).rejects.toThrow(
      "AGENT_WALLET_NOT_FOUND"
    );
  });
});
