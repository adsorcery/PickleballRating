CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_user_idx` ON `admin_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`kind` text NOT NULL,
	`local_path` text,
	`size_bytes` integer,
	`offsite_status` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`team` text NOT NULL,
	`position` integer NOT NULL,
	`pre_rating` real,
	`delta_rating` real,
	`post_rating` real,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "match_players_team_chk" CHECK("match_players"."team" in ('A', 'B')),
	CONSTRAINT "match_players_position_chk" CHECK("match_players"."position" in (1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_slot_uq` ON `match_players` (`match_id`,`team`,`position`);--> statement-breakpoint
CREATE INDEX `match_players_player_idx` ON `match_players` (`player_id`,`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`played_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`format_target` integer NOT NULL,
	`score_a` integer NOT NULL,
	`score_b` integer NOT NULL,
	`status` text NOT NULL,
	`rated` integer DEFAULT true NOT NULL,
	`algorithm_version` text NOT NULL,
	`config_snapshot` text NOT NULL,
	`predicted_point_share_a` real,
	`predicted_win_prob_a` real,
	`entered_by` text,
	`confirmed_at` integer,
	`idempotency_key` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matches_format_chk" CHECK("matches"."format_target" in (11, 15, 21)),
	CONSTRAINT "matches_scores_chk" CHECK("matches"."score_a" >= 0 and "matches"."score_b" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_idempotency_key_unique` ON `matches` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `matches_status_played_idx` ON `matches` (`status`,`played_at`,`id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`initial_cinco_rating` real NOT NULL,
	`current_cinco_rating` real NOT NULL,
	`dupr_rating` real,
	`avatar_url` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_display_name_idx` ON `players` (`display_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_display_name_nocase_uq` ON `players` (lower("display_name"));--> statement-breakpoint
CREATE TABLE `prediction_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` text,
	`input_json` text NOT NULL,
	`probability_a` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rating_config_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`algorithm_version` text NOT NULL,
	`beta` real NOT NULL,
	`k` real NOT NULL,
	`maximum_team_delta` real NOT NULL,
	`weights` text NOT NULL,
	`matchup_discount` text NOT NULL,
	`trailing_window_days` integer NOT NULL,
	`provisional_games` integer NOT NULL,
	`timezone` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_config_versions_version_unique` ON `rating_config_versions` (`version`);--> statement-breakpoint
CREATE TABLE `rating_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`match_id` text NOT NULL,
	`rating_before` real NOT NULL,
	`rating_after` real NOT NULL,
	`delta` real NOT NULL,
	`played_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_history_player_match_uq` ON `rating_history` (`player_id`,`match_id`);--> statement-breakpoint
CREATE INDEX `rating_history_player_played_idx` ON `rating_history` (`player_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);