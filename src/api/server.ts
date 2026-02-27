import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { createAppContext, closeAppContext } from "./appContext";
import { agentsRoutes } from "./routes/agents";
import { executionRoutes } from "./routes/executions";
import { healthRoutes } from "./routes/health";
import { intentsRoutes } from "./routes/intents";
import { policiesRoutes } from "./routes/policies";
import { walletsRoutes } from "./routes/wallets";
import { requestLogger } from "./middleware/requestLogger";
import { logError, logInfo } from "../observability/logger";

async function main(): Promise<void> {
  const appContext = await createAppContext();

  const app = new OpenAPIHono();
  app.use("*", requestLogger);

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const baseUrl = process.env.API_BASE_URL?.trim() || `http://localhost:${port}`;

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Aegis Agent Wallet API",
      version: "1.0.0",
      description:
        "API for agent registration, wallet orchestration, policy assignment, and intent execution.",
    },
    servers: [{ url: baseUrl }],
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  app.route("/", healthRoutes);
  app.route("/", agentsRoutes);
  app.route("/", walletsRoutes);
  app.route("/", intentsRoutes);
  app.route("/", executionRoutes);
  app.route("/", policiesRoutes);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  logInfo(`Aegis API started on ${baseUrl}`, {
    port,
    docs: "/docs",
    openapi: "/openapi.json",
  });

  const shutdown = () => {
    server.stop(true);
    closeAppContext(appContext);
    logInfo("Aegis API stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logError("Fatal API startup error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
