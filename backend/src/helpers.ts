import type { Context } from "oak";
import type { MemeRow } from "./db/memes.ts";

export type Meme = {
  id: string;
  title: string;
  tags: string[];
  filePath: string | null;
  thumbnailPath: string | null;
  textContent: string | null;
  fileSize: number;
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
    filePath: row.filePath ?? null,
    thumbnailPath: row.thumbnailPath ?? null,
    textContent: row.textContent ?? null,
    fileSize: row.fileSize,
    createdAt: new Date(row.createdAt).getTime(),
  };
}

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function mimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}
