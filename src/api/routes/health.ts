import { Hono } from "hono";
import { getActiveAppContext } from "../appContext";

const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  const context = getActiveAppContext();
  return c.json({
    status: "ok",
    dbPath: context.dbPath,
    provider: "privy",
    ts: new Date().toISOString()
  });
});

export { healthRoutes };
