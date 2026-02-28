ALTER TABLE `policies` ADD `owner_agent_id` text REFERENCES `agents`(`id`) ON DELETE CASCADE;
CREATE INDEX `idx_policies_owner_status` ON `policies` (`owner_agent_id`,`status`);
