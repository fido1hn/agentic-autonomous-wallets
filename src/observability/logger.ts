import pino from "pino";

const level = process.env.LOG_LEVEL?.trim() || "info";
const nodeEnv = process.env.NODE_ENV ?? "development";
const usePrettyLogs = nodeEnv !== "production";

export const logger = pino({
  level,
  base: {
    service: "aegis-api",
    env: nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(usePrettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
            ignore: "pid,hostname,service,env,event",
            messageFormat: "{msg}",
          },
        },
      }
    : {}),
});

export function logInfo(message: string, details?: Record<string, unknown>): void {
  logger.info({ ...details }, message);
}

export function logWarn(message: string, details?: Record<string, unknown>): void {
  logger.warn({ ...details }, message);
}

export function logError(message: string, details?: Record<string, unknown>): void {
  logger.error({ ...details }, message);
}
