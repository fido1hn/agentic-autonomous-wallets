import { Hono } from "hono";
import { getActiveAppContext } from "../appContext";
import { jsonError } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

const walletsRoutes = new Hono();

walletsRoutes.post("/agents/:agentId/wallet", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const scopedAgentId = c.req.param("agentId");
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
});

walletsRoutes.get("/agents/:agentId/wallet", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const scopedAgentId = c.req.param("agentId");
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
});

export { walletsRoutes };
