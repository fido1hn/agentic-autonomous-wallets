CREATE TABLE `agent_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`label` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
