import type { Context } from "hono";
import { getActiveAppContext } from "../appContext";
import { jsonError } from "../http";

export interface AgentAuthResult {
  agentId: string;
}

export async function requireAgentAuth(c: Context): Promise<AgentAuthResult | Response> {
  const agentId = c.req.header("x-agent-id");
  const apiKey = c.req.header("x-agent-api-key");

  if (!agentId || !apiKey) {
    return jsonError(c, 401, "UNAUTHORIZED", "Missing x-agent-id or x-agent-api-key header");
  }

  const { agentAuthService } = getActiveAppContext();
  const valid = await agentAuthService.verify(agentId, apiKey);
  if (!valid) {
    return jsonError(c, 401, "UNAUTHORIZED", "Invalid agent credentials");
  }

  return { agentId };
}

export function ensureAgentScope(c: Context, authenticatedAgentId: string, scopedAgentId: string): Response | null {
  if (authenticatedAgentId !== scopedAgentId) {
    return jsonError(c, 403, "FORBIDDEN_AGENT_SCOPE", "Authenticated agent cannot access this scope");
  }
  return null;
}
