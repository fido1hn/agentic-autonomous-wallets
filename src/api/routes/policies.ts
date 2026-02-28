import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { jsonError, parseLimit } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";
import { parseAegisPolicyDsl } from "../../types/policy";

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const createPolicyBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  dsl: z.object({}).passthrough(),
});

const updatePolicyBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
  dsl: z.object({}).passthrough().optional(),
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
  },
});

policiesRoutes.openapi(createPolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const body = c.req.valid("json");

  let dsl;
  try {
    dsl = parseAegisPolicyDsl(body.dsl);
  } catch {
    return jsonError(c, 400, "POLICY_DSL_INVALID", "dsl is invalid");
  }

  const { policyService } = getActiveAppContext();
  const policy = await policyService.createPolicy(auth.agentId, {
    name: body.name.trim(),
    description: body.description,
    dsl,
  });

  return c.json(policy);
}) as any);

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
  },
});

policiesRoutes.openapi(listPoliciesRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const query = c.req.valid("query");
  const limit = parseLimit(query.limit, 50, 200);
  const assigned = parseAssignedQuery(query.assigned);
  const { policyService } = getActiveAppContext();
  const data = await policyService.listPolicies(auth.agentId, {
    limit,
    status: query.status,
    assigned,
    assignedAgentId: auth.agentId,
  });
  return c.json({ count: data.length, data });
}) as any);

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
  },
});

policiesRoutes.openapi(getPolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { policyId } = c.req.valid("param");
  const { policyService, db } = getActiveAppContext();
  const policy = await policyService.getPolicy(auth.agentId, policyId);
  if (!policy) {
    return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
  }

  const assignment = await db.repositories.walletPolicyAssignments.find(auth.agentId, policyId);
  return c.json({
    ...policy,
    assignment: {
      assignedToAgentWallet: !!assignment,
      priority: assignment?.priority,
    },
  });
}) as any);

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
  },
});

policiesRoutes.openapi(updatePolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { policyId } = c.req.valid("param");
  const body = c.req.valid("json");

  let dsl = undefined;
  if (body.dsl !== undefined) {
    try {
        dsl = parseAegisPolicyDsl(body.dsl);
    } catch {
      return jsonError(c, 400, "POLICY_DSL_INVALID", "dsl is invalid");
    }
  }

  const { policyService } = getActiveAppContext();
  try {
    const updated = await policyService.updatePolicy(auth.agentId, policyId, {
      name: body.name,
      description: body.description,
      status: body.status,
      dsl,
    });
    return c.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "POLICY_ARCHIVED") {
      return jsonError(c, 400, "POLICY_ARCHIVED", "Archived policies cannot be edited");
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not update policy");
  }
}) as any);

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
  },
});

policiesRoutes.openapi(archivePolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { policyId } = c.req.valid("param");
  const { policyService } = getActiveAppContext();
  try {
    const archived = await policyService.archivePolicy(auth.agentId, policyId);
    return c.json({ id: archived.id, status: "archived" as const });
  } catch (error) {
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not archive policy");
  }
}) as any);

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

policiesRoutes.openapi(assignPolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { agentId: scopedAgentId, policyId } = c.req.valid("param");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) return scopeError;

  const body = c.req.valid("json") ?? {};
  const { policyService } = getActiveAppContext();

  try {
    await policyService.assignPolicyToAgentWallet(auth.agentId, scopedAgentId, policyId, {
      priority: body.priority,
    });
    return c.json({ agentId: scopedAgentId, policyId, status: "assigned" as const });
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
    }
    if (error instanceof Error && error.message === "POLICY_ARCHIVED") {
      return jsonError(c, 400, "POLICY_ARCHIVED", "Archived policies cannot be assigned");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not assign policy");
  }
}) as any);

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
  },
});

policiesRoutes.openapi(unassignPolicyRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { agentId: scopedAgentId, policyId } = c.req.valid("param");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) return scopeError;

  const { policyService } = getActiveAppContext();
  try {
    await policyService.unassignPolicyFromAgentWallet(auth.agentId, scopedAgentId, policyId);
    return c.json({ agentId: scopedAgentId, policyId, status: "unassigned" as const });
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
    }
    if (error instanceof Error && error.message === "POLICY_NOT_FOUND") {
      return jsonError(c, 404, "POLICY_NOT_FOUND", "Policy not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not unassign policy");
  }
}) as any);

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
  },
});

policiesRoutes.openapi(listAgentPoliciesRoute, (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) return auth;

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scopeError = ensureAgentScope(c, auth.agentId, scopedAgentId);
  if (scopeError) return scopeError;

  const { policyService } = getActiveAppContext();
  try {
    const data = await policyService.listAgentWalletPoliciesWithAssignments(auth.agentId, scopedAgentId);
    return c.json({ agentId: scopedAgentId, count: data.length, data });
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not list assigned policies");
  }
}) as any);

export { policiesRoutes };
