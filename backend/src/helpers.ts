import type { Context } from "oak";
import type { MemeRow } from "./db/memes.ts";

export type Meme = {
  id: string;
  title: string;
  tags: string[];
  imageDataUrl: string;
  createdAt: number;
};

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getAuthToken(ctx: Context): string | null {
  const auth = ctx.request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice("Bearer ".length).trim();
    if (UUID_RE.test(t)) return t;
  }
  const headerToken = ctx.request.headers.get("x-guest-token");
  if (headerToken && UUID_RE.test(headerToken)) return headerToken;
  return null;
}

export function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map((x) => String(x));
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed.map((x: unknown) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function rowToMeme(row: MemeRow): Meme {
  return {
    id: row.id,
    title: row.title,
    tags: parseTags(row.tags),
    imageDataUrl: row.imageDataUrl,
    createdAt: new Date(row.createdAt).getTime(),
  };
}
