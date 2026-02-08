import {
  datetime,
  json,
  longtext,
  mysqlTable,
  varchar,
} from "npm:drizzle-orm@0.38.4/mysql-core";

export const memes = mysqlTable("memes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  tags: json("tags").notNull().$type<string[]>(),
  imageDataUrl: longtext("image_data_url").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
});

export const authTokens = mysqlTable("auth_tokens", {
  token: varchar("token", { length: 36 }).primaryKey(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
  lastUsedAt: datetime("last_used_at", { mode: "date", fsp: 3 }),
});
