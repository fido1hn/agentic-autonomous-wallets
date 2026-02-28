import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { routeIntent } from "../../core/intentRouter";
import { validateExecutionIntent } from "../../types/intents";
import { jsonError } from "../http";
import { ensureAgentScope, requireAgentAuth } from "../middleware/auth";

const intentsRoutes = new OpenAPIHono();

const authHeadersSchema = z.object({
  "x-agent-id": z.string(),
  "x-agent-api-key": z.string(),
});

const executionIntentBodySchema = z
  .object({
    agentId: z.string(),
    action: z.enum(["swap", "transfer"]),
    amountAtomic: z.string(),
    idempotencyKey: z.string().optional(),
    walletAddress: z.string().optional(),
    fromMint: z.string().optional(),
    toMint: z.string().optional(),
    maxSlippageBps: z.number().int().min(1).max(10_000).optional(),
    transferAsset: z.enum(["native", "spl"]).optional(),
    recipientAddress: z.string().optional(),
    mintAddress: z.string().optional(),
  })
  .passthrough();

const intentApprovedSchema = z.object({
  status: z.literal("approved"),
  provider: z.literal("privy"),
  txSignature: z.string(),
  policyChecks: z.array(z.string()),
});

const intentRejectedSchema = z.object({
  status: z.literal("rejected"),
  reasonCode: z.string(),
  reasonDetail: z.string().optional(),
  policyChecks: z.array(z.string()),
});

const intentValidationErrorSchema = z.object({
  error: z.object({
    code: z.literal("INTENT_VALIDATION_FAILED"),
    message: z.string(),
    errors: z.array(z.string()),
  }),
});

const genericErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const executeIntentRoute = createRoute({
  method: "post",
  path: "/intents/execute",
  summary: "Execute an intent through Aegis policy + signing pipeline",
  request: {
    headers: authHeadersSchema,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: executionIntentBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Intent result",
      content: {
        "application/json": {
          schema: z.union([intentApprovedSchema, intentRejectedSchema]),
        },
      },
    },
    400: {
      description: "Intent validation failed",
      content: {
        "application/json": {
          schema: intentValidationErrorSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: genericErrorSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: genericErrorSchema,
        },
      },
    },
  },
});

intentsRoutes.openapi(
  executeIntentRoute,
  (async (c: any) => {
  const auth = await requireAgentAuth(c);
  if (auth instanceof Response) {
    return auth;
  }

  const input = c.req.valid("json");
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
  }) as any,
);

export { intentsRoutes };
