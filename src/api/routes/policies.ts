import { Hono } from "hono";
import { getActiveAppContext } from "../appContext";
import { jsonError, parseLimit, safeParseJson } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";
import { parseAegisPolicyDslV1 } from "../../types/policy";

interface CreatePolicyBody {
  name?: string;
  description?: string;
  dsl?: unknown;
}

const policiesRoutes = new Hono();

policiesRoutes.post("/policies", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await safeParseJson<CreatePolicyBody>(c);
  if (!body || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError(c, 400, "BAD_REQUEST", "name is required");
  }

  if (!body.dsl) {
    return jsonError(c, 400, "BAD_REQUEST", "dsl is required");
  }

  let dsl;
  try {
    dsl = parseAegisPolicyDslV1(body.dsl);
  } catch {
    return jsonError(c, 400, "POLICY_DSL_INVALID", "dsl is invalid");
  }

  const { policyService } = getActiveAppContext();
  const policy = await policyService.createPolicy({
    name: body.name.trim(),
    description: body.description,
    dsl
  });

  return c.json(policy);
});

policiesRoutes.get("/policies", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const limit = parseLimit(c.req.query("limit"), 50, 200);
  const { db } = getActiveAppContext();
  const data = await db.repositories.policies.list({ limit });
  return c.json({ count: data.length, data });
});

policiesRoutes.post("/agents/:agentId/policies/:policyId", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const scopedAgentId = c.req.param("agentId");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) {
    return scopeError;
  }

  const policyId = c.req.param("policyId");
  const { policyService } = getActiveAppContext();

  try {
    await policyService.assignPolicyToAgentWallet(scopedAgentId, policyId);
    return c.json({ agentId: scopedAgentId, policyId, status: "assigned" as const });
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not assign policy");
  }
});

policiesRoutes.get("/agents/:agentId/policies", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const scopedAgentId = c.req.param("agentId");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) {
    return scopeError;
  }

  const { policyService } = getActiveAppContext();
  const data = await policyService.listAgentWalletPolicies(scopedAgentId);
  return c.json({ agentId: scopedAgentId, count: data.length, data });
});

export { policiesRoutes };
