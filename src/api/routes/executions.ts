import { Hono } from "hono";
import { getActiveAppContext } from "../appContext";
import { jsonError, parseLimit } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

const executionRoutes = new Hono();

executionRoutes.get("/agents/:agentId/executions", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const scopedAgentId = c.req.param("agentId");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) {
    return scopeError;
  }

  const limit = parseLimit(c.req.query("limit"), 50, 200);
  const { db } = getActiveAppContext();

  try {
    const logs = await db.repositories.executionLogs.listByAgentId(scopedAgentId, { limit });
    return c.json({ agentId: scopedAgentId, count: logs.length, data: logs });
  } catch {
    return jsonError(c, 500, "INTERNAL_ERROR", "Failed to list executions");
  }
});

export { executionRoutes };
