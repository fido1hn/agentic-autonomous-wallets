CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`status` text NOT NULL,
	`reason_code` text,
	`provider` text,
	`tx_signature` text,
	`policy_checks_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wallet_bindings` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`wallet_ref` text NOT NULL,
	`provider` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
