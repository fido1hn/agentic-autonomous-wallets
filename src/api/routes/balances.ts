import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { getWalletBalances } from "../../protocols/solanaReadAdapter";
import { apiErrorBody, authenticateAgentRequest, ensureScopedAgentAccess } from "./routeHelpers";

const balancesRoutes = new OpenAPIHono();

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const agentPathSchema = z.object({
  agentId: z.string(),
});

const walletBalancesSchema = z.object({
  agentId: z.string(),
  walletAddress: z.string(),
  native: z.object({
    lamports: z.string(),
    sol: z.string(),
  }),
  tokens: z.array(
    z.object({
      mint: z.string(),
      amountAtomic: z.string(),
      decimals: z.number().int(),
      uiAmount: z.string(),
      ata: z.string(),
    })
  ),
  slot: z.number().int(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const getBalancesRoute = createRoute({
  method: "get",
  path: "/agents/{agentId}/balances",
  summary: "Get native SOL and SPL token balances for an agent wallet",
  request: {
    params: agentPathSchema,
    headers: authHeadersSchema,
  },
  responses: {
    200: {
      description: "Wallet balances",
      content: {
        "application/json": {
          schema: walletBalancesSchema,
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

balancesRoutes.openapi(getBalancesRoute, async (c) => {
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
    if (!wallet.walletAddress) {
      return c.json(apiErrorBody(requestId, "WALLET_ADDRESS_UNAVAILABLE", "Wallet address unavailable"), 500);
    }
    const balances = await getWalletBalances(wallet.walletAddress);
    return c.json(
      {
        agentId: scopedAgentId,
        ...balances,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
      return c.json(apiErrorBody(requestId, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found"), 404);
    }
    return c.json(apiErrorBody(requestId, "SOLANA_RPC_READ_FAILED", "Could not load wallet balances"), 500);
  }
});

export { balancesRoutes };
