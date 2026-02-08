CREATE TABLE IF NOT EXISTS `memes` (
	`id` varchar(36) NOT NULL,
	`title` varchar(500) NOT NULL,
	`tags` json NOT NULL,
	`image_data_url` longtext NOT NULL,
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
