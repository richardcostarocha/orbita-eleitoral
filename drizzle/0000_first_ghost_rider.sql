CREATE TABLE `result_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`election` text NOT NULL,
	`observed_at` integer NOT NULL,
	`body` text NOT NULL
);
