import { sql } from "npm:drizzle-orm@0.38.4";
import { memes } from "./schema.ts";
import { getDb } from "./connection.ts";

export async function getStorageUsedBytes(): Promise<number> {
  const result = await getDb()
    .select({
      total: sql<number>`COALESCE(SUM(${memes.fileSize}), 0)`,
    })
    .from(memes);
  return Number(result[0]?.total ?? 0);
}

export function getMaxStorageBytes(): number {
  const mb = parseInt(Deno.env.get("MAX_STORAGE_MB") ?? "5000");
  return mb * 1024 * 1024;
}
