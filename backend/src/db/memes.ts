import { asc, desc, eq, like, or, sql } from "npm:drizzle-orm@0.38.4";
import { memes } from "./schema.ts";
import { getDb } from "./connection.ts";

export type MemeRow = typeof memes.$inferSelect;

export async function insertMeme(
  id: string,
  title: string,
  tags: string[],
  imageDataUrl: string,
  createdAt: Date,
): Promise<void> {
  await getDb().insert(memes).values({
    id,
    title,
    tags,
    imageDataUrl,
    createdAt,
  });
}

export async function listMemes(
  searchTerm: string | null,
  sortBy: string,
  limit: number,
  offset: number,
): Promise<{ items: MemeRow[]; total: number }> {
  const db = getDb();

  const whereClause = searchTerm?.trim()
    ? (() => {
      const escaped = searchTerm.trim().replace(/[%_\\]/g, "\\$&");
      const pattern = `%${escaped}%`;
      return or(
        like(memes.title, pattern),
        sql`LOWER(${memes.tags}) LIKE LOWER(${pattern})`,
      );
    })()
    : undefined;

  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(memes)
    .where(whereClause);
  const total = Number(countResult[0]?.count ?? 0);

  const orderExpr = (() => {
    switch (sortBy) {
      case "a-z":
        return asc(memes.title);
      case "z-a":
        return desc(memes.title);
      case "oldest":
        return asc(memes.createdAt);
      default:
        return desc(memes.createdAt);
    }
  })();

  const items = await db
    .select()
    .from(memes)
    .where(whereClause)
    .orderBy(orderExpr)
    .limit(limit)
    .offset(offset);

  return { items, total };
}

export async function getMemeById(id: string): Promise<MemeRow | null> {
  const rows = await getDb()
    .select()
    .from(memes)
    .where(eq(memes.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateMeme(
  id: string,
  title: string,
  tags: string[],
  imageDataUrl: string,
): Promise<boolean> {
  const result = await getDb()
    .update(memes)
    .set({ title, tags, imageDataUrl })
    .where(eq(memes.id, id));
  return (result[0] as unknown as { affectedRows: number }).affectedRows > 0;
}

export async function deleteMeme(id: string): Promise<boolean> {
  const result = await getDb().delete(memes).where(eq(memes.id, id));
  return (result[0] as unknown as { affectedRows: number }).affectedRows > 0;
}
