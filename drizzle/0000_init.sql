CREATE TABLE `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_usage_provider_idx` ON `api_usage` (`provider`,`created_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`name` text,
	`role` text,
	`email` text,
	`phone` text,
	`linkedin` text,
	`source` text NOT NULL,
	`source_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_lead_idx` ON `contacts` (`lead_id`);--> statement-breakpoint
CREATE TABLE `enrichments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`steps` text NOT NULL,
	`data` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `enrichments_lead_idx` ON `enrichments` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`category` text,
	`description` text,
	`address` text,
	`city` text,
	`country` text,
	`lat` real,
	`lng` real,
	`phone` text,
	`email` text,
	`website` text,
	`domain` text,
	`socials` text DEFAULT '{}' NOT NULL,
	`rating` real,
	`review_count` integer,
	`business_status` text,
	`founded_at` text,
	`google_place_id` text,
	`osm_id` text,
	`ceidg_id` text,
	`nip` text,
	`regon` text,
	`krs` text,
	`source` text NOT NULL,
	`signals` text DEFAULT '{}' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`score_breakdown` text DEFAULT '[]' NOT NULL,
	`ai_adjustment` integer,
	`ai_reasons` text,
	`suggested_services` text,
	`pitch` text,
	`status` text DEFAULT 'new' NOT NULL,
	`processed_at` integer,
	`follow_up_at` integer,
	`assigned_to` text,
	`enriched_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_place_idx` ON `leads` (`google_place_id`);--> statement-breakpoint
CREATE INDEX `leads_osm_idx` ON `leads` (`osm_id`);--> statement-breakpoint
CREATE INDEX `leads_ceidg_idx` ON `leads` (`ceidg_id`);--> statement-breakpoint
CREATE INDEX `leads_nip_idx` ON `leads` (`nip`);--> statement-breakpoint
CREATE INDEX `leads_domain_idx` ON `leads` (`domain`);--> statement-breakpoint
CREATE INDEX `leads_name_city_idx` ON `leads` (`normalized_name`,`city`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_score_idx` ON `leads` (`score`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer NOT NULL,
	`body` text NOT NULL,
	`author` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_lead_idx` ON `notes` (`lead_id`);--> statement-breakpoint
CREATE TABLE `search_results` (
	`search_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`was_new` integer NOT NULL,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_results_search_idx` ON `search_results` (`search_id`);--> statement-breakpoint
CREATE TABLE `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`query` text NOT NULL,
	`location` text,
	`params` text DEFAULT '{}' NOT NULL,
	`next_page_token` text,
	`result_count` integer DEFAULT 0 NOT NULL,
	`new_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
