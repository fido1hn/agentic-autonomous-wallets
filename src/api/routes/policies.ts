import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { parseLimit } from "../http";
import { parseAegisPolicyDsl } from "../../types/policy";
import { apiErrorBody, authenticateAgentRequest, ensureScopedAgentAccess } from "./routeHelpers";

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const createPolicyBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  dsl: z.looseObject({}),
});

const updatePolicyBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  dsl: z.looseObject({}).optional(),
});

const listPoliciesQuerySchema = z.object({
  limit: z.string().optional(),
  status: z.enum(["active", "disabled", "archived"]).optional(),
  assigned: z.enum(["true", "false"]).optional(),
});

const assignmentPathSchema = z.object({
  agentId: z.string(),
  policyId: z.string(),
});

const policyPathSchema = z.object({
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
  ownerAgentId: z.string().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "disabled", "archived"]),
  dsl: z.looseObject({}),
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

const policySummarySchema = z.object({
  allowedActions: z.array(z.enum(["swap", "transfer"])).optional(),
  maxLamportsPerTx: z.string().optional(),
  allowedMints: z.array(z.string()).optional(),
  maxSlippageBps: z.number().optional(),
  allowedRecipients: z.array(z.string()).optional(),
  blockedRecipients: z.array(z.string()).optional(),
  allowedSwapPairs: z.array(z.object({ fromMint: z.string(), toMint: z.string() })).optional(),
  allowedSwapProtocols: z.array(z.enum(["auto", "jupiter", "raydium", "orca"])).optional(),
  maxLamportsPerDayByAction: z
    .object({
      swap: z.string().optional(),
      transfer: z.string().optional(),
    })
    .partial()
    .optional(),
  maxLamportsPerTxByAction: z
    .object({
      swap: z.string().optional(),
      transfer: z.string().optional(),
    })
    .partial()
    .optional(),
  maxLamportsPerTxByMint: z.array(z.object({ mint: z.string(), lteLamports: z.string() })).optional(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

function parseAssignedQuery(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

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
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

policiesRoutes.openapi(createPolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const body = c.req.valid("json");

  let dsl;
  try {
    dsl = parseAegisPolicyDsl(body.dsl);
  } catch {
    return c.json(apiErrorBody(requestId, "POLICY_DSL_INVALID", "dsl is invalid"), 400);
  }

  const policy = await policyService.createPolicy(headerAgentId, {
    name: body.name.trim(),
    description: body.description,
    dsl,
  });

  return c.json(policy, 200);
});

const listPoliciesRoute = createRoute({
  method: "get",
  path: "/policies",
  summary: "List caller-owned policies",
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
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

policiesRoutes.openapi(listPoliciesRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const query = c.req.valid("query");
  const limit = parseLimit(query.limit, 50, 200);
  const assigned = parseAssignedQuery(query.assigned);
  const data = await policyService.listPolicies(headerAgentId, {
    limit,
    status: query.status,
    assigned,
    assignedAgentId: headerAgentId,
  });
  return c.json({ count: data.length, data }, 200);
});

const getPolicyRoute = createRoute({
  method: "get",
  path: "/policies/{policyId}",
  summary: "Get one caller-owned policy",
  request: {
    headers: authHeadersSchema,
    params: policyPathSchema,
  },
  responses: {
    200: {
      description: "Policy detail",
      content: {
        "application/json": {
          schema: policySchema.extend({
            assignment: z.object({
              assignedToAgentWallet: z.boolean(),
              priority: z.number().optional(),
            }),
          }),
        },
      },
    },
    404: {
      description: "Policy not found",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
  },
});

policiesRoutes.openapi(getPolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService, db } = getActiveAppContext();

  const { policyId } = c.req.valid("param");
  const policy = await policyService.getPolicy(headerAgentId, policyId);
  if (!policy) {
    return c.json(apiErrorBody(requestId, "POLICY_NOT_FOUND", "Policy not found"), 404);
  }

  const assignment = await db.repositories.walletPolicyAssignments.find(headerAgentId, policyId);
  return c.json(
    {
      ...policy,
      assignment: {
        assignedToAgentWallet: !!assignment,
        priority: assignment?.priority,
      },
    },
    200
  );
});

const updatePolicyRoute = createRoute({
  method: "patch",
  path: "/policies/{policyId}",
  summary: "Update a caller-owned policy",
  request: {
    headers: authHeadersSchema,
    params: policyPathSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: updatePolicyBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated policy",
      content: {
        "application/json": { schema: policySchema },
      },
    },
    400: {
      description: "Invalid policy update",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    404: {
      description: "Policy not found",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    500: {
      description: "Internal error",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
  },
});

policiesRoutes.openapi(updatePolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const { policyId } = c.req.valid("param");
  const body = c.req.valid("json");

  let dsl = undefined;
  if (body.dsl !== undefined) {
    try {
      dsl = parseAegisPolicyDsl(body.dsl);
    } catch {
      return c.json(apiErrorBody(requestId, "POLICY_DSL_INVALID", "dsl is invalid"), 400);
    }
  }

  try {
    const updated = await policyService.updatePolicy(headerAgentId, policyId, {
      name: body.name,
      description: body.description,
      status: body.status,
      dsl,
    });
    return c.json(updated, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "POLICY_ARCHIVED") {
      return c.json(apiErrorBody(requestId, "POLICY_ARCHIVED", "Archived policies cannot be edited"), 400);
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "POLICY_NOT_FOUND", "Policy not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not update policy"), 500);
  }
});

const archivePolicyRoute = createRoute({
  method: "delete",
  path: "/policies/{policyId}",
  summary: "Archive a caller-owned policy",
  request: {
    headers: authHeadersSchema,
    params: policyPathSchema,
  },
  responses: {
    200: {
      description: "Policy archived",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            status: z.literal("archived"),
          }),
        },
      },
    },
    404: {
      description: "Policy not found",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    500: {
      description: "Internal error",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
  },
});

policiesRoutes.openapi(archivePolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const { policyId } = c.req.valid("param");
  try {
    const archived = await policyService.archivePolicy(headerAgentId, policyId);
    return c.json({ id: archived.id, status: "archived" as const }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "POLICY_NOT_FOUND", "Policy not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not archive policy"), 500);
  }
});

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
    400: {
      description: "Invalid assignment",
      content: {
        "application/json": {
          schema: errorSchema,
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

policiesRoutes.openapi(assignPolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const { agentId: scopedAgentId, policyId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  const body = c.req.valid("json") ?? {};

  try {
    await policyService.assignPolicyToAgentWallet(headerAgentId, scopedAgentId, policyId, {
      priority: body.priority,
    });
    return c.json({ agentId: scopedAgentId, policyId, status: "assigned" as const }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found"), 404);
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "POLICY_NOT_FOUND", "Policy not found"), 404);
    }
    if (error instanceof Error && error.message === "POLICY_ARCHIVED") {
      return c.json(apiErrorBody(requestId, "POLICY_ARCHIVED", "Archived policies cannot be assigned"), 400);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not assign policy"), 500);
  }
});

const unassignPolicyRoute = createRoute({
  method: "delete",
  path: "/agents/{agentId}/policies/{policyId}",
  summary: "Unassign policy from an agent wallet",
  request: {
    headers: authHeadersSchema,
    params: assignmentPathSchema,
  },
  responses: {
    200: {
      description: "Policy unassigned",
      content: {
        "application/json": {
          schema: z.object({
            agentId: z.string(),
            policyId: z.string(),
            status: z.literal("unassigned"),
          }),
        },
      },
    },
    404: {
      description: "Wallet or policy not found",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    500: {
      description: "Internal error",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
  },
});

policiesRoutes.openapi(unassignPolicyRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const { agentId: scopedAgentId, policyId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  try {
    await policyService.unassignPolicyFromAgentWallet(headerAgentId, scopedAgentId, policyId);
    return c.json({ agentId: scopedAgentId, policyId, status: "unassigned" as const }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found"), 404);
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "POLICY_NOT_FOUND", "Policy not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not unassign policy"), 500);
  }
});

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
                effectiveOrder: z.number(),
                assignment: assignmentSchema,
                policy: policySchema,
                summary: policySummarySchema,
              })
            ),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    404: {
      description: "Wallet not found",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
    500: {
      description: "Internal error",
      content: {
        "application/json": { schema: errorSchema },
      },
    },
  },
});

policiesRoutes.openapi(listAgentPoliciesRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { policyService } = getActiveAppContext();

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  try {
    const data = await policyService.listAgentWalletPoliciesWithAssignments(headerAgentId, scopedAgentId);
    return c.json({ agentId: scopedAgentId, count: data.length, data }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not list assigned policies"), 500);
  }
});

export { policiesRoutes };
