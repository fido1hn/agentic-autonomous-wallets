import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { parseLimit } from "../http";
import { apiErrorBody, authenticateAgentRequest, ensureScopedAgentAccess } from "./routeHelpers";

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
    500: {
      description: "Internal error",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

executionRoutes.openapi(listExecutionsRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { db } = getActiveAppContext();

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  const query = c.req.valid("query");
  const limit = parseLimit(query.limit, 50, 200);

  try {
    const logs = await db.repositories.executionLogs.listByAgentId(scopedAgentId, { limit });
    return c.json(
      {
        agentId: scopedAgentId,
        count: logs.length,
        data: logs.map((log) => ({
          ...log,
          reasonCode: log.reasonCode ?? undefined,
          txSignature: log.txSignature ?? undefined,
        })),
      },
      200
    );
  } catch {
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Failed to list executions"), 500);
  }
});

export { executionRoutes };
