import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { jsonError } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

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
  updatedAt: z.string(),
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
  },
});

walletsRoutes.openapi(
  createWalletRoute,
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

  const { agentWalletService } = getActiveAppContext();
  try {
    const wallet = await agentWalletService.createAgentWallet(scopedAgentId);
    return c.json(wallet);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_NOT_FOUND", "Agent not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not create wallet");
  }
  }) as any,
);

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
  },
});

walletsRoutes.openapi(
  getWalletRoute,
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

  const { agentWalletService } = getActiveAppContext();
  try {
    const wallet = await agentWalletService.getAgentWallet(scopedAgentId);
    return c.json(wallet);
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
    }
    return jsonError(c, 500, "INTERNAL_ERROR", "Could not load wallet");
  }
  }) as any,
);

export { walletsRoutes };
