import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { jsonError, parseLimit } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";
import { parseAegisPolicyDslV1 } from "../../types/policy";

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const createPolicyBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  dsl: z.object({}).passthrough(),
});

const listPoliciesQuerySchema = z.object({
  limit: z.string().optional(),
});

const assignmentPathSchema = z.object({
  agentId: z.string(),
  policyId: z.string(),
});

const agentPathSchema = z.object({
  agentId: z.string(),
});

const assignPolicyBodySchema = z.object({
  priority: z.number().int().min(0).max(1000).optional(),
});

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "disabled", "archived"]),
  dsl: z.object({}).passthrough(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const assignmentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  policyId: z.string(),
  priority: z.number(),
  createdAt: z.string(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const policiesRoutes = new OpenAPIHono();

const createPolicyRoute = createRoute({
  method: "post",
  path: "/policies",
  summary: "Create a policy",
  request: {
    headers: authHeadersSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createPolicyBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Policy created",
      content: {
        "application/json": {
          schema: policySchema,
        },
      },
    },
    400: {
      description: "Invalid policy payload",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

policiesRoutes.openapi(
  createPolicyRoute,
  (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const body = c.req.valid("json");

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
  }) as any,
);

const listPoliciesRoute = createRoute({
  method: "get",
  path: "/policies",
  summary: "List policies",
  request: {
    headers: authHeadersSchema,
    query: listPoliciesQuerySchema,
  },
  responses: {
    200: {
      description: "Policies list",
      content: {
        "application/json": {
          schema: z.object({
            count: z.number(),
            data: z.array(policySchema),
          }),
        },
      },
    },
  },
});

policiesRoutes.openapi(
  listPoliciesRoute,
  (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const query = c.req.valid("query");
  const limit = parseLimit(query.limit, 50, 200);
  const { db } = getActiveAppContext();
  const data = await db.repositories.policies.list({ limit });
  return c.json({ count: data.length, data });
  }) as any,
);

const assignPolicyRoute = createRoute({
  method: "post",
  path: "/agents/{agentId}/policies/{policyId}",
  summary: "Assign policy to an agent wallet",
  request: {
    headers: authHeadersSchema,
    params: assignmentPathSchema,
    body: {
      required: false,
      content: {
        "application/json": {
          schema: assignPolicyBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Policy assigned",
      content: {
        "application/json": {
          schema: z.object({
            agentId: z.string(),
            policyId: z.string(),
            status: z.literal("assigned"),
          }),
        },
      },
    },
    404: {
      description: "Wallet or policy not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

policiesRoutes.openapi(
  assignPolicyRoute,
  (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const { agentId: scopedAgentId, policyId } = c.req.valid("param");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) {
    return scopeError;
  }

  const body = c.req.valid("json") ?? {};
  const { policyService } = getActiveAppContext();

  try {
    const priority = body.priority;

    await policyService.assignPolicyToAgentWallet(scopedAgentId, policyId, {
      priority
    });
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
  }) as any,
);

const listAgentPoliciesRoute = createRoute({
  method: "get",
  path: "/agents/{agentId}/policies",
  summary: "List assigned policies for an agent wallet",
  request: {
    headers: authHeadersSchema,
    params: agentPathSchema,
  },
  responses: {
    200: {
      description: "Assigned policy list",
      content: {
        "application/json": {
          schema: z.object({
            agentId: z.string(),
            count: z.number(),
            data: z.array(
              z.object({
                assignment: assignmentSchema,
                policy: policySchema,
              }),
            ),
          }),
        },
      },
    },
  },
});

policiesRoutes.openapi(
  listAgentPoliciesRoute,
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

  const { policyService } = getActiveAppContext();
  const data = await policyService.listAgentWalletPolicies(scopedAgentId);
  return c.json({ agentId: scopedAgentId, count: data.length, data });
  }) as any,
);

export { policiesRoutes };
