import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { apiErrorBody, authenticateAgentRequest, ensureScopedAgentAccess } from "./routeHelpers";

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const agentPathSchema = z.object({
  agentId: z.string(),
});

const walletResponseSchema = z.object({
  agentId: z.string(),
  walletRef: z.string(),
  walletAddress: z.string().optional(),
  provider: z.literal("privy"),
  updatedAt: z.string().optional(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const walletsRoutes = new OpenAPIHono();

const createWalletRoute = createRoute({
  method: "post",
  path: "/agents/{agentId}/wallet",
  summary: "Create or load wallet for an agent",
  request: {
    params: agentPathSchema,
    headers: authHeadersSchema,
  },
  responses: {
    200: {
      description: "Wallet binding",
      content: {
        "application/json": {
          schema: walletResponseSchema,
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
    404: {
      description: "Agent not found",
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

walletsRoutes.openapi(createWalletRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { agentWalletService } = getActiveAppContext();

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  try {
    const wallet = await agentWalletService.createAgentWallet(scopedAgentId);
    return c.json(wallet, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_NOT_FOUND", "Agent not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not create wallet"), 500);
  }
});

const getWalletRoute = createRoute({
  method: "get",
  path: "/agents/{agentId}/wallet",
  summary: "Get wallet for an agent",
  request: {
    params: agentPathSchema,
    headers: authHeadersSchema,
  },
  responses: {
    200: {
      description: "Wallet binding",
      content: {
        "application/json": {
          schema: walletResponseSchema,
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
    404: {
      description: "Wallet not found",
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

walletsRoutes.openapi(getWalletRoute, async (c) => {
  const auth = await authenticateAgentRequest(c);
  if (!auth.ok) {
    return c.json(auth.body, auth.status);
  }

  const { requestId, agentId: headerAgentId } = auth;
  const { agentWalletService } = getActiveAppContext();

  const { agentId: scopedAgentId } = c.req.valid("param");
  const scope = ensureScopedAgentAccess(requestId, headerAgentId, scopedAgentId);
  if (!scope.ok) {
    return c.json(scope.body, scope.status);
  }

  try {
    const wallet = await agentWalletService.getAgentWallet(scopedAgentId);
    return c.json(wallet, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "INTERNAL_ERROR", "Could not load wallet"), 500);
  }
});

export { walletsRoutes };
