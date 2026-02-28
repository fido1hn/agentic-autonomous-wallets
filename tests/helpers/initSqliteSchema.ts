import type { Database } from "bun:sqlite";

export function initSqliteSchema(client: Database): void {
  client.exec("PRAGMA foreign_keys = ON;");
  client.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE wallet_bindings (
      agent_id TEXT PRIMARY KEY NOT NULL,
      wallet_ref TEXT NOT NULL,
      wallet_address TEXT,
      provider TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE agent_api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      label TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE execution_logs (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason_code TEXT,
      provider TEXT,
      tx_signature TEXT,
      policy_checks_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE daily_spend_counters (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      spent_lamports TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX daily_spend_counters_agent_day_idx
      ON daily_spend_counters(agent_id, day_key);

    CREATE TABLE intent_idempotency_records (
      id TEXT PRIMARY KEY NOT NULL,
      agent_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX intent_idempotency_records_agent_key_idx
      ON intent_idempotency_records(agent_id, idempotency_key);

    CREATE INDEX idx_agents_status ON agents(status);
    CREATE INDEX idx_agent_api_keys_agent_status ON agent_api_keys(agent_id, status);
    CREATE INDEX idx_execution_logs_agent_created_at ON execution_logs(agent_id, created_at);
  `);
}
