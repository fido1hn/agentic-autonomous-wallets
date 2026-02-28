import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";
import { jsonError } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";
import { getWalletBalances } from "../../protocols/solanaReadAdapter";

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
  },
});

balancesRoutes.openapi(
  getBalancesRoute,
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
      if (!wallet.walletAddress) {
        return jsonError(c, 500, "WALLET_ADDRESS_UNAVAILABLE", "Wallet address unavailable");
      }
      const balances = await getWalletBalances(wallet.walletAddress);
      return c.json({
        agentId: scopedAgentId,
        ...balances,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "AGENT_WALLET_NOT_FOUND") {
        return jsonError(c, 404, "AGENT_WALLET_NOT_FOUND", "Agent wallet not found");
      }
      return jsonError(c, 500, "SOLANA_RPC_READ_FAILED", "Could not load wallet balances");
    }
  }) as any
);

export { balancesRoutes };
