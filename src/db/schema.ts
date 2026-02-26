import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  lastUsedAt: text("last_used_at")
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
