import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const agentsTable = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const walletBindingsTable = sqliteTable("wallet_bindings", {
  agentId: text("agent_id")
    .primaryKey()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  walletRef: text("wallet_ref").notNull(),
  provider: text("provider", { enum: ["privy"] }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentApiKeysTable = sqliteTable("agent_api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  label: text("label"),
  status: text("status", { enum: ["active", "revoked"] }).notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

export const executionLogsTable = sqliteTable("execution_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: text("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["approved", "rejected"] }).notNull(),
  reasonCode: text("reason_code"),
  provider: text("provider", { enum: ["privy"] }),
  txSignature: text("tx_signature"),
  policyChecksJson: text("policy_checks_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const policiesTable = sqliteTable("policies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["active", "disabled", "archived"],
  }).notNull(),
  dslJson: text("dsl_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const walletPolicyAssignmentsTable = sqliteTable(
  "wallet_policy_assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id")
      .notNull()
      .references(() => walletBindingsTable.agentId, { onDelete: "cascade" }),
    policyId: text("policy_id")
      .notNull()
      .references(() => policiesTable.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(100),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("wallet_policy_assignments_agent_policy_idx").on(
      table.agentId,
      table.policyId,
    ),
  ],
);

export const dailySpendCountersTable = sqliteTable(
  "daily_spend_counters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    dayKey: text("day_key").notNull(),
    spentLamports: text("spent_lamports").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("daily_spend_counters_agent_day_idx").on(table.agentId, table.dayKey),
  ],
);

export const intentIdempotencyRecordsTable = sqliteTable(
  "intent_idempotency_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("intent_idempotency_records_agent_key_idx").on(
      table.agentId,
      table.idempotencyKey,
    ),
  ],
);
