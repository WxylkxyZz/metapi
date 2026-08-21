-- Drop the site weight chain: sites.global_weight and downstream_api_keys.site_weight_multipliers
-- were conflated with channel-level weight and are removed so channel weight is the single entry.
ALTER TABLE `sites` DROP COLUMN `global_weight`;
--> statement-breakpoint
ALTER TABLE `downstream_api_keys` DROP COLUMN `site_weight_multipliers`;