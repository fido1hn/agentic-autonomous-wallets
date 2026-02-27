import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveAppContext } from "../appContext";

const healthRoutes = new OpenAPIHono();

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "Health check",
  responses: {
    200: {
      description: "Service health payload",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok"),
            dbPath: z.string(),
            provider: z.literal("privy"),
            ts: z.string(),
          }),
        },
      },
    },
  },
});

healthRoutes.openapi(healthRoute, (c) => {
  const context = getActiveAppContext();
  return c.json({
    status: "ok",
    dbPath: context.dbPath,
    provider: "privy",
    ts: new Date().toISOString(),
  });
});

export { healthRoutes };
