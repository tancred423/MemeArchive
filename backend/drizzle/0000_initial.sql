CREATE TABLE IF NOT EXISTS `memes` (
	`id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`tags` json NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`thumbnail_path` varchar(500),
	`file_size` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `memes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_tokens` (
	`token` varchar(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`last_used_at` datetime(3),
	CONSTRAINT `auth_tokens_token` PRIMARY KEY(`token`)
);
