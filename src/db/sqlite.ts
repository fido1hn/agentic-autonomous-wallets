import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { createAgentsRepository } from "./repositories/agentsRepository";
import { createExecutionLogsRepository } from "./repositories/executionLogsRepository";
import { createWalletBindingsRepository } from "./repositories/walletBindingsRepository";
import type { Repositories } from "./types";

export type {
  AgentRecord,
  AgentRepository,
  AgentStatus,
  CreateAgentInput,
  CreateExecutionLogInput,
  ExecutionLogRecord,
  ExecutionLogRepository,
  ProviderName,
  Repositories,
  UpsertWalletBindingInput,
  WalletBindingRecord,
  WalletBindingRepository
} from "./types";

export interface SqliteContext {
  // Low-level Bun SQLite client (used for lifecycle control, e.g. close()).
  client: Database;
  // Typed Drizzle DB instance for query builders/repositories.
  db: BunSQLiteDatabase<typeof schema>;
  // Repository facade used by services/core flow.
  repositories: Repositories;
}

// Ensure the DB parent directory exists for file-backed SQLite paths.
function ensureParentDirectory(dbPath: string): void {
  if (dbPath === ":memory:") {
    return;
  }
  mkdirSync(dirname(dbPath), { recursive: true });
}

// Resolve DB path from caller/env/default.
// `:memory:` is reserved for tests or ephemeral runs.
export function resolveDbPath(pathFromCaller?: string): string {
  const configured = pathFromCaller ?? process.env.AEGIS_DB_PATH ?? "./data/aegis.db";
  if (configured === ":memory:") {
    return configured;
  }
  return resolve(process.cwd(), configured);
}

// Create a raw SQLite client + Drizzle wrapper.
// This function only creates the connection context; migrations are handled separately.
export function createDrizzleDb(
  pathFromCaller?: string
): { client: Database; db: BunSQLiteDatabase<typeof schema> } {
  const dbPath = resolveDbPath(pathFromCaller);
  ensureParentDirectory(dbPath);

  const client = new Database(dbPath);
  const db = drizzle(client, { schema });
  return { client, db };
}

// Compose repository modules over the shared Drizzle DB instance.
export function createRepositories(db: BunSQLiteDatabase<typeof schema>): Repositories {
  return {
    agents: createAgentsRepository(db),
    walletBindings: createWalletBindingsRepository(db),
    executionLogs: createExecutionLogsRepository(db)
  };
}

// Convenience app/test entrypoint: returns DB handles + repository layer.
export function connectSqlite(pathFromCaller?: string): SqliteContext {
  const { client, db } = createDrizzleDb(pathFromCaller);
  return {
    client,
    db,
    repositories: createRepositories(db)
  };
}
