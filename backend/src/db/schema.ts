import {
  datetime,
  int,
  json,
  mysqlTable,
  varchar,
} from "npm:drizzle-orm@0.38.4/mysql-core";

export const memes = mysqlTable("memes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  tags: json("tags").notNull().$type<string[]>(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  thumbnailPath: varchar("thumbnail_path", { length: 500 }),
  fileSize: int("file_size").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
});

export const authTokens = mysqlTable("auth_tokens", {
  token: varchar("token", { length: 36 }).primaryKey(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  lastUsedAt: datetime("last_used_at", { mode: "date", fsp: 3 }),
});
