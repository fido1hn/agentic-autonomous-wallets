import { Hono } from "hono";
import { createAppContext, closeAppContext } from "./appContext";
import { agentsRoutes } from "./routes/agents";
import { executionRoutes } from "./routes/executions";
import { healthRoutes } from "./routes/health";
import { intentsRoutes } from "./routes/intents";
import { policiesRoutes } from "./routes/policies";
import { walletsRoutes } from "./routes/wallets";

async function main(): Promise<void> {
  const appContext = await createAppContext();

  const app = new Hono();
  app.route("/", healthRoutes);
  app.route("/", agentsRoutes);
  app.route("/", walletsRoutes);
  app.route("/", intentsRoutes);
  app.route("/", executionRoutes);
  app.route("/", policiesRoutes);

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(
    `Aegis API listening on http://localhost:${port} (db: ${appContext.dbPath})`,
  );

  const shutdown = () => {
    server.stop(true);
    closeAppContext(appContext);
    console.log("Aegis API stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal API startup error", error);
  process.exit(1);
});
