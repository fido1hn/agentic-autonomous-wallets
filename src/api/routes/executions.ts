import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { jsonError, parseLimit } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

const executionRoutes = new OpenAPIHono();

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const agentPathSchema = z.object({
  agentId: z.string(),
});

const listExecutionsQuerySchema = z.object({
  limit: z.string().optional(),
});

const executionLogSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  status: z.enum(["approved", "rejected"]),
  reasonCode: z.string().optional(),
  provider: z.literal("privy").optional(),
  txSignature: z.string().optional(),
  policyChecks: z.array(z.string()),
  createdAt: z.string(),
});

const listExecutionsResponseSchema = z.object({
  agentId: z.string(),
  count: z.number(),
  data: z.array(executionLogSchema),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const listExecutionsRoute = createRoute({
  method: "get",
  path: "/agents/{agentId}/executions",
  summary: "List execution logs for an agent",
  request: {
    params: agentPathSchema,
    query: listExecutionsQuerySchema,
    headers: authHeadersSchema,
  },
  responses: {
    200: {
      description: "Execution logs",
      content: {
        "application/json": {
          schema: listExecutionsResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

executionRoutes.openapi(
  listExecutionsRoute,
  (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) {
    return scopeError;
  }

  const query = c.req.valid("query");
  const limit = parseLimit(query.limit, 50, 200);
  const { db } = getActiveAppContext();

  try {
    const logs = await db.repositories.executionLogs.listByAgentId(scopedAgentId, { limit });
    return c.json({ agentId: scopedAgentId, count: logs.length, data: logs });
  } catch {
    return jsonError(c, 500, "INTERNAL_ERROR", "Failed to list executions");
  }
  }) as any,
);

export { executionRoutes };
