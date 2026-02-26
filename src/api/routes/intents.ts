import { Hono } from "hono";
import { routeIntent } from "../../core/intentRouter";
import { validateExecutionIntent } from "../../types/intents";
import { jsonError, safeParseJson } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

const intentsRoutes = new Hono();

intentsRoutes.post("/intents/execute", async (c) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const input = await safeParseJson<unknown>(c);
  const validated = validateExecutionIntent(input);
  if (!validated.ok || !validated.intent) {
    return c.json(
      {
        error: {
          code: "INTENT_VALIDATION_FAILED",
          message: "ExecutionIntent payload is invalid",
          errors: validated.errors
        }
      },
      400
    );
  }

  const scopeError = ensureAgentScope(c, auth.agentId, validated.intent.agentId);
  if (scopeError) {
    return scopeError;
  }

  try {
    const result = await routeIntent(validated.intent);
    return c.json(result);
  } catch {
    return jsonError(c, 500, "INTERNAL_ERROR", "Failed to execute intent");
  }
});

export { intentsRoutes };
