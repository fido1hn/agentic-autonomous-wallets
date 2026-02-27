import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { REQUEST_ID_CTX_KEY } from "./middleware/requestLogger";

export function getRequestId(c: Context): string {
  const fromContext = c.get(REQUEST_ID_CTX_KEY);
  if (typeof fromContext === "string" && fromContext.trim() !== "") {
    return fromContext;
  }

  const existing = c.req.header("x-request-id");
  if (existing && existing.trim() !== "") {
    return existing.trim();
  }
  return crypto.randomUUID();
}

export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string
): Response {
  return c.json(
    {
      error: {
        code,
        message,
        requestId: getRequestId(c)
      }
    },
    status
  );
}

export async function safeParseJson<T>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}

export function parseLimit(raw: string | undefined, fallback = 50, max = 200): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}
