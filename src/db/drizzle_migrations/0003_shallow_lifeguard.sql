CREATE TABLE `daily_spend_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`day_key` text NOT NULL,
	`spent_lamports` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_spend_counters_agent_day_idx` ON `daily_spend_counters` (`agent_id`,`day_key`);--> statement-breakpoint
CREATE TABLE `intent_idempotency_records` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intent_idempotency_records_agent_key_idx` ON `intent_idempotency_records` (`agent_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `wallet_policy_assignments` ADD `priority` integer DEFAULT 100 NOT NULL;