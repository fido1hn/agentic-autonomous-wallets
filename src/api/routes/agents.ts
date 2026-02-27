import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";

const createAgentBodySchema = z
  .object({
    name: z.string().trim().min(1).openapi({ example: "agent-alpha" }),
    status: z.enum(["active", "paused"]).optional().openapi({ example: "active" }),
  })
  .openapi("CreateAgentBody");

const createAgentResponseSchema = z
  .object({
    agentId: z.string(),
    name: z.string(),
    status: z.enum(["active", "paused"]),
    apiKey: z.string(),
  })
  .openapi("CreateAgentResponse");

const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
    }),
  })
  .openapi("ApiError");

const agentsRoutes = new OpenAPIHono();

const createAgentRoute = createRoute({
  method: "post",
  path: "/agents",
  summary: "Create an agent and issue an API key",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createAgentBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Agent created",
      content: {
        "application/json": {
          schema: createAgentResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid payload",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

agentsRoutes.openapi(
  createAgentRoute,
  (async (c: any) => {
  const body = c.req.valid("json");

  const { agentService, agentAuthService } = getActiveAppContext();
  const agent = await agentService.createAgent({
    name: body.name.trim(),
    status: body.status,
  });

  const { apiKey } = await agentAuthService.issueKey(agent.id);
    return c.json({
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      apiKey,
    });
  }) as any,
);

export { agentsRoutes };
