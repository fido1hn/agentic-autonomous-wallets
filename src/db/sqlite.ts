import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
import { createAgentsRepository } from "./repositories/agentsRepository";
import { createAgentApiKeysRepository } from "./repositories/agentApiKeysRepository";
import { createDailyActionSpendCountersRepository } from "./repositories/dailyActionSpendCountersRepository";
import { createDailySpendCountersRepository } from "./repositories/dailySpendCountersRepository";
import { createExecutionLogsRepository } from "./repositories/executionLogsRepository";
import { createIntentIdempotencyRepository } from "./repositories/intentIdempotencyRepository";
import { createPoliciesRepository } from "./repositories/policiesRepository";
import { createWalletBindingsRepository } from "./repositories/walletBindingsRepository";
import { createWalletPolicyAssignmentsRepository } from "./repositories/walletPolicyAssignmentsRepository";
import type { Repositories } from "./types";

export type {
  AgentRecord,
  AgentApiKeyRecord,
  AgentApiKeyRepository,
  AgentRepository,
  AgentApiKeyStatus,
  AgentStatus,
  CreateAgentApiKeyInput,
  CreateAgentInput,
  CreateExecutionLogInput,
  DailySpendCounterRecord,
  DailyActionSpendCounterRecord,
  DailyActionSpendCounterRepository,
  DailySpendCounterRepository,
  ExecutionLogRecord,
  ExecutionLogRepository,
  IntentIdempotencyRecord,
  IntentIdempotencyRepository,
  CreatePolicyInput,
  PolicyRecord,
  PolicyRepository,
  PolicyStatus,
  ProviderName,
  Repositories,
  UpsertWalletBindingInput,
  WalletPolicyAssignmentRecord,
  WalletPolicyAssignmentRepository,
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

export interface MigrationOptions {
  migrationsFolder?: string;
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

// Resolve migration folder from caller/env/default.
export function resolveMigrationsFolder(folderFromCaller?: string): string {
  const configured =
    folderFromCaller ??
    process.env.AEGIS_MIGRATIONS_PATH ??
    "./src/db/drizzle_migrations";
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
    agentApiKeys: createAgentApiKeysRepository(db),
    walletBindings: createWalletBindingsRepository(db),
    executionLogs: createExecutionLogsRepository(db),
    policies: createPoliciesRepository(db),
    walletPolicyAssignments: createWalletPolicyAssignmentsRepository(db),
    dailySpendCounters: createDailySpendCountersRepository(db),
    dailyActionSpendCounters: createDailyActionSpendCountersRepository(db),
    intentIdempotency: createIntentIdempotencyRepository(db)
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

// Apply all pending Drizzle migrations for this DB.
// Safe to run on every startup; only unapplied migrations execute.
export function runDrizzleMigrations(
  db: BunSQLiteDatabase<typeof schema>,
  options?: MigrationOptions
): void {
  const migrationsFolder = resolveMigrationsFolder(options?.migrationsFolder);
  migrate(db, { migrationsFolder });
}
