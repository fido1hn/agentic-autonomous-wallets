import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../src/api/appContext";
import { clearActiveAppContext, setActiveAppContextForTests } from "../src/api/appContext";
import { policiesRoutes } from "../src/api/routes/policies";
import { connectSqlite, runDrizzleMigrations, type SqliteContext } from "../src/db/sqlite";
import { AgentAuthService } from "../src/services/agentAuthService";
import { AgentService } from "../src/services/agentService";
import { AgentWalletService } from "../src/services/agentWalletService";
import { PolicyService } from "../src/services/policyService";

describe("policies routes", () => {
  let db: SqliteContext | null = null;

  afterEach(() => {
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

    const app = new Hono();
    app.route("/", policiesRoutes);

    const agent = await agentService.createAgent({ name: "policy-api-agent" });
    const { apiKey } = await agentAuthService.issueKey(agent.id);
    await db.repositories.walletBindings.upsert({
      agentId: agent.id,
      walletRef: "wallet_agent_1",
      provider: "privy"
    });

    return { app, agent, apiKey, agentService, agentAuthService };
  }

  it("creates and lists policies", async () => {
    const { app, agent, apiKey } = await setup();

    const createRes = await app.request("http://localhost/policies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({
        name: "Swap only policy",
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "allowed_actions", actions: ["swap"] }]
        }
      })
    });

    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { id: string; name: string; ownerAgentId: string };
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.name).toBe("Swap only policy");
    expect(created.ownerAgentId).toBe(agent.id);

    const listRes = await app.request("http://localhost/policies", {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });

    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { count: number; data: Array<{ id: string }> };
    expect(listed.count).toBe(1);
    expect(listed.data[0]?.id).toBe(created.id);
  });

  it("assigns a policy to agent wallet and lists assigned policies", async () => {
    const { app, agent, apiKey } = await setup();

    const createRes = await app.request("http://localhost/policies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({
        name: "Max amount",
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "max_lamports_per_tx", lteLamports: "1000000" }]
        }
      })
    });
    const created = (await createRes.json()) as { id: string };

    const assignRes = await app.request(`http://localhost/agents/${agent.id}/policies/${created.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({ priority: 250 })
    });
    expect(assignRes.status).toBe(200);

    const listAssignedRes = await app.request(`http://localhost/agents/${agent.id}/policies`, {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    expect(listAssignedRes.status).toBe(200);
    const assigned = (await listAssignedRes.json()) as {
      count: number;
      data: Array<{ effectiveOrder: number; policy: { id: string }; summary: { maxLamportsPerTx?: string } }>;
    };
    expect(assigned.count).toBe(1);
    expect(assigned.data[0]?.policy.id).toBe(created.id);
    expect(assigned.data[0]?.effectiveOrder).toBe(1);
    expect(assigned.data[0]?.summary.maxLamportsPerTx).toBe("1000000");

    const assignments = await db!.repositories.walletPolicyAssignments.listByAgentId(agent.id);
    expect(assignments[0]?.priority).toBe(250);
  });

  it("enforces agent scope on assignment endpoint", async () => {
    const { app, agent, agentService, agentAuthService } = await setup();

    const other = await agentService.createAgent({ name: "other-agent" });
    const { apiKey: otherKey } = await agentAuthService.issueKey(other.id);

    const createRes = await app.request("http://localhost/policies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": other.id,
        "x-agent-api-key": otherKey
      },
      body: JSON.stringify({
        name: "Other policy",
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "allowed_actions", actions: ["swap"] }]
        }
      })
    });
    const created = (await createRes.json()) as { id: string };

    const forbidden = await app.request(`http://localhost/agents/${agent.id}/policies/${created.id}`, {
      method: "POST",
      headers: {
        "x-agent-id": other.id,
        "x-agent-api-key": otherKey
      }
    });
    expect(forbidden.status).toBe(403);

    const forbiddenList = await app.request(`http://localhost/agents/${agent.id}/policies`, {
      headers: {
        "x-agent-id": other.id,
        "x-agent-api-key": otherKey
      }
    });
    expect(forbiddenList.status).toBe(403);
  });

  it("gets, updates, archives, and unassigns a caller-owned policy", async () => {
    const { app, agent, apiKey } = await setup();

    const createRes = await app.request("http://localhost/policies", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({
        name: "Transfer cap",
        dsl: {
          version: "aegis.policy.v1",
          rules: [{ kind: "max_lamports_per_tx", lteLamports: "1000000" }]
        }
      })
    });
    const created = (await createRes.json()) as { id: string };

    const getRes = await app.request(`http://localhost/policies/${created.id}`, {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as { assignment: { assignedToAgentWallet: boolean } };
    expect(detail.assignment.assignedToAgentWallet).toBe(false);

    const patchRes = await app.request(`http://localhost/policies/${created.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({
        name: "Transfer cap updated",
        status: "disabled"
      })
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { name: string; status: string };
    expect(patched.name).toBe("Transfer cap updated");
    expect(patched.status).toBe("disabled");

    const assignRes = await app.request(`http://localhost/agents/${agent.id}/policies/${created.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      },
      body: JSON.stringify({ priority: 90 })
    });
    expect(assignRes.status).toBe(200);

    const unassignRes = await app.request(`http://localhost/agents/${agent.id}/policies/${created.id}`, {
      method: "DELETE",
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    expect(unassignRes.status).toBe(200);

    const archiveRes = await app.request(`http://localhost/policies/${created.id}`, {
      method: "DELETE",
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    expect(archiveRes.status).toBe(200);
    const archived = (await archiveRes.json()) as { status: string };
    expect(archived.status).toBe("archived");
  });

  it("filters policies by assignment state", async () => {
    const { app, agent, apiKey } = await setup();

    const createOne = async (name: string) => {
      const response = await app.request("http://localhost/policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-id": agent.id,
          "x-agent-api-key": apiKey
        },
        body: JSON.stringify({
          name,
          dsl: {
            version: "aegis.policy.v1",
            rules: [{ kind: "allowed_actions", actions: ["swap"] }]
          }
        })
      });
      return (await response.json()) as { id: string };
    };

    const assigned = await createOne("Assigned");
    await createOne("Unassigned");
    await app.request(`http://localhost/agents/${agent.id}/policies/${assigned.id}`, {
      method: "POST",
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });

    const assignedRes = await app.request("http://localhost/policies?assigned=true", {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    const assignedBody = (await assignedRes.json()) as { count: number };
    expect(assignedBody.count).toBe(1);

    const unassignedRes = await app.request("http://localhost/policies?assigned=false", {
      headers: {
        "x-agent-id": agent.id,
        "x-agent-api-key": apiKey
      }
    });
    const unassignedBody = (await unassignedRes.json()) as { count: number };
    expect(unassignedBody.count).toBe(1);
  });
});
