import type { Context, Next } from "hono";
import { logger } from "../../observability/logger";

export const REQUEST_ID_CTX_KEY = "requestId";
const defaultSkippedPaths = new Set(["/docs", "/openapi.json", "/favicon.ico", "/health"]);
const extraSkippedPaths = (process.env.LOG_SKIP_PATHS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter((p) => p.length > 0);
const skippedPaths = new Set([...defaultSkippedPaths, ...extraSkippedPaths]);

function getRequestId(c: Context): string {
  const existing = c.req.header("x-request-id");
  if (existing && existing.trim() !== "") {
    return existing.trim();
  }
  return crypto.randomUUID();
}

export async function requestLogger(c: Context, next: Next): Promise<void> {
  const requestId = getRequestId(c);
  c.set(REQUEST_ID_CTX_KEY, requestId);
  c.header("x-request-id", requestId);

  const start = performance.now();

  await next();

  if (skippedPaths.has(c.req.path)) {
    return;
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const payload = {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  };
  if (c.res.status >= 500) {
    logger.error(payload, "HTTP request failed");
    return;
  }
  if (c.res.status >= 400) {
    logger.warn(payload, "HTTP request warning");
    return;
  }
  logger.info(
    {
      ...payload,
    },
    "HTTP request",
  );
}
