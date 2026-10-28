ALTER TABLE `matches` ADD `win_by` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `preferred_win_by` integer DEFAULT 1 NOT NULL;