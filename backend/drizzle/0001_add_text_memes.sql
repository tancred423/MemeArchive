ALTER TABLE `memes` ADD `text_content` text;--> statement-breakpoint
ALTER TABLE `memes` MODIFY `file_path` varchar(500) NULL;--> statement-breakpoint
ALTER TABLE `memes` MODIFY `file_size` int NOT NULL DEFAULT 0;
