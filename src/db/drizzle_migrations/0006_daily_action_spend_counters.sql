CREATE TABLE `daily_action_spend_counters` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL REFERENCES `agents`(`id`) ON DELETE cascade,
  `day_key` text NOT NULL,
  `action` text NOT NULL,
  `spent_lamports` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `daily_action_spend_counters_agent_day_action_idx`
  ON `daily_action_spend_counters` (`agent_id`, `day_key`, `action`);
