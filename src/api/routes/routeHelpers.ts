import type { Context } from "hono";
import { getActiveAppContext } from "../appContext";
import { getRequestId } from "../http";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface RouteAuthSuccess {
  ok: true;
  requestId: string;
  agentId: string;
}

export interface RouteAuthFailure {
  ok: false;
  status: 401;
  body: ApiErrorBody;
}

export interface RouteScopeFailure {
  ok: false;
  status: 403;
  body: ApiErrorBody;
}

export function apiErrorBody(requestId: string, code: string, message: string): ApiErrorBody {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

export async function authenticateAgentRequest(
  c: Context
): Promise<RouteAuthSuccess | RouteAuthFailure> {
  const requestId = getRequestId(c);
  const agentId = c.req.header("x-agent-id");
  const apiKey = c.req.header("x-agent-api-key");

  if (!agentId || !apiKey) {
    return {
      ok: false,
      status: 401,
      body: apiErrorBody(requestId, "UNAUTHORIZED", "Missing x-agent-id or x-agent-api-key header"),
    };
  }

  const { agentAuthService } = getActiveAppContext();
  const valid = await agentAuthService.verify(agentId, apiKey);
  if (!valid) {
    return {
      ok: false,
      status: 401,
      body: apiErrorBody(requestId, "UNAUTHORIZED", "Invalid agent credentials"),
    };
  }

  return { ok: true, requestId, agentId };
}

export function ensureScopedAgentAccess(
  requestId: string,
  authenticatedAgentId: string,
  scopedAgentId: string
): { ok: true } | RouteScopeFailure {
  if (authenticatedAgentId === scopedAgentId) {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    body: apiErrorBody(
      requestId,
      "FORBIDDEN_AGENT_SCOPE",
      "Authenticated agent cannot access this scope"
    ),
  };
}
