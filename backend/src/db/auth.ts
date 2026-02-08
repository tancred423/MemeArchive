import { eq, isNull, lt, or, sql } from "npm:drizzle-orm@0.38.4";
import { authTokens } from "./schema.ts";
import { getDb } from "./connection.ts";

export async function addAuthToken(token: string): Promise<void> {
  const now = new Date();
  await getDb().insert(authTokens).values({
    token,
    createdAt: now,
    lastUsedAt: now,
  });
}

export async function hasAuthToken(token: string): Promise<boolean> {
  const rows = await getDb()
    .select({ token: authTokens.token })
    .from(authTokens)
    .where(eq(authTokens.token, token))
    .limit(1);
  return rows.length > 0;
}

export async function touchAuthToken(token: string): Promise<void> {
  await getDb()
    .update(authTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(authTokens.token, token));
}

export async function removeAuthToken(token: string): Promise<boolean> {
  const result = await getDb()
    .delete(authTokens)
    .where(eq(authTokens.token, token));
  return (result[0] as unknown as { affectedRows: number }).affectedRows > 0;
}

const AUTH_TOKEN_MAX_AGE_DAYS = 7;

export async function cleanupAuthTokens(): Promise<number> {
  const cutoff = sql`DATE_SUB(NOW(), INTERVAL ${AUTH_TOKEN_MAX_AGE_DAYS} DAY)`;
  const result = await getDb()
    .delete(authTokens)
    .where(
      or(lt(authTokens.lastUsedAt, cutoff), isNull(authTokens.lastUsedAt)),
    );
  return (result[0] as unknown as { affectedRows: number }).affectedRows;
}
