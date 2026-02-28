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
    const { agentService, policyService } = createServices();
    const agent = await agentService.createAgent({ name: "owner-agent" });

    const policy = await policyService.createPolicy(agent.id, {
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

    const policy = await policyService.createPolicy(agent.id, {
      name: "Swap Guardrails",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });

    await policyService.assignPolicyToAgentWallet(agent.id, agent.id, policy.id);
    const assigned = await policyService.listAgentWalletPolicies(agent.id);

    expect(assigned.length).toBe(1);
    expect(assigned[0]?.id).toBe(policy.id);
  });

  it("rejects policy assignment when wallet has not been created", async () => {
    const { agentService, policyService } = createServices();
    const agent = await agentService.createAgent({ name: "no-wallet-agent" });
    const policy = await policyService.createPolicy(agent.id, {
      name: "Any",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap", "transfer"] }]
      }
    });

    await expect(policyService.assignPolicyToAgentWallet(agent.id, agent.id, policy.id)).rejects.toThrow(
      "AGENT_WALLET_NOT_FOUND"
    );
  });

  it("applies explicit assignment priority and returns policies in precedence order", async () => {
    const { agentService, agentWalletService, policyService } = createServices();
    const agent = await agentService.createAgent({ name: "ordered-policy-agent" });
    await agentWalletService.createAgentWallet(agent.id);

    const low = await policyService.createPolicy(agent.id, {
      name: "Low priority policy",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });
    const high = await policyService.createPolicy(agent.id, {
      name: "High priority policy",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "max_lamports_per_tx", lteLamports: "1000000" }]
      }
    });

    await policyService.assignPolicyToAgentWallet(agent.id, agent.id, low.id, { priority: 10 });
    await policyService.assignPolicyToAgentWallet(agent.id, agent.id, high.id, { priority: 200 });

    const assignments = await db!.repositories.walletPolicyAssignments.listByAgentId(agent.id);
    expect(assignments[0]?.policyId).toBe(high.id);
    expect(assignments[0]?.priority).toBe(200);
    expect(assignments[1]?.policyId).toBe(low.id);
    expect(assignments[1]?.priority).toBe(10);
  });

  it("lists only owner policies and updates active policies", async () => {
    const { agentService, policyService } = createServices();
    const owner = await agentService.createAgent({ name: "owner" });
    const other = await agentService.createAgent({ name: "other" });

    const policy = await policyService.createPolicy(owner.id, {
      name: "Owner policy",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["transfer"] }]
      }
    });
    await policyService.createPolicy(other.id, {
      name: "Other policy",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });

    const listed = await policyService.listPolicies(owner.id);
    expect(listed.length).toBe(1);
    expect(listed[0]?.id).toBe(policy.id);

    const updated = await policyService.updatePolicy(owner.id, policy.id, {
      name: "Owner policy updated",
      status: "disabled"
    });
    expect(updated.name).toBe("Owner policy updated");
    expect(updated.status).toBe("disabled");
  });

  it("archives policies and rejects later edits", async () => {
    const { agentService, policyService } = createServices();
    const owner = await agentService.createAgent({ name: "owner" });

    const policy = await policyService.createPolicy(owner.id, {
      name: "Archive me",
      dsl: {
        version: "aegis.policy.v1",
        rules: [{ kind: "allowed_actions", actions: ["swap"] }]
      }
    });

    const archived = await policyService.archivePolicy(owner.id, policy.id);
    expect(archived.status).toBe("archived");

    await expect(
      policyService.updatePolicy(owner.id, policy.id, {
        name: "Should fail"
      })
    ).rejects.toThrow("POLICY_ARCHIVED");
  });

  it("creates and summarizes v2 policies", async () => {
    const { agentService, policyService } = createServices();
    const owner = await agentService.createAgent({ name: "owner-v2" });

    const policy = await policyService.createPolicy(owner.id, {
      name: "Orca-only swap policy",
      dsl: {
        version: "aegis.policy.v2",
        rules: [
          { kind: "allowed_actions", actions: ["swap"] },
          { kind: "allowed_swap_protocols", protocols: ["orca"] },
          {
            kind: "allowed_swap_pairs",
            pairs: [
              {
                fromMint: "So11111111111111111111111111111111111111112",
                toMint: "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"
              }
            ]
          },
          { kind: "max_lamports_per_day_by_action", action: "swap", lteLamports: "500000000" }
        ]
      }
    });

    const summary = policyService.summarizePolicy(policy);
    expect(policy.dsl.version).toBe("aegis.policy.v2");
    expect(summary.allowedSwapProtocols).toEqual(["orca"]);
    expect(summary.allowedSwapPairs?.[0]?.toMint).toBe("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
    expect(summary.maxLamportsPerDayByAction?.swap).toBe("500000000");
  });
});
