CREATE TABLE `intent_executions` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL REFERENCES `agents`(`id`) ON DELETE cascade,
  `idempotency_key` text NOT NULL,
  `status` text NOT NULL,
  `action` text NOT NULL,
  `intent_json` text NOT NULL,
  `result_json` text,
  `wallet_ref` text,
  `wallet_address` text,
  `provider` text,
  `serialized_tx_json` text,
  `tx_signature` text,
  `tx_signatures_json` text,
  `reason_code` text,
  `reason_detail` text,
  `policy_checks_json` text,
  `policy_match_json` text,
  `current_step` text,
  `spend_applied_at` text,
  `audit_logged_at` text,
  `last_transition_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intent_executions_agent_key_idx`
  ON `intent_executions` (`agent_id`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `intent_executions_agent_created_idx`
  ON `intent_executions` (`agent_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `intent_executions_status_updated_idx`
  ON `intent_executions` (`status`, `updated_at`);
--> statement-breakpoint
DROP INDEX IF EXISTS `intent_idempotency_records_agent_key_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `intent_idempotency_records`;
