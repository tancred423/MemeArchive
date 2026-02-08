import { Router } from "oak";
import * as memesDb from "../db/memes.ts";
import * as storageDb from "../db/storage.ts";
import { rowToMeme } from "../helpers.ts";

const router = new Router();

router.get("/api", (ctx) => {
  ctx.response.body = { ok: true };
});

router.get("/api/memes", async (ctx) => {
  const params = ctx.request.url.searchParams;
  const search = (params.get("search") ?? "").trim();
  const sort = (params.get("sort") ?? "newest").toLowerCase();
  const page = Math.max(1, parseInt(params.get("page") ?? "1") || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(params.get("limit") ?? "24") || 24),
  );
  const offset = (page - 1) * limit;

  const { items: rows, total } = await memesDb.listMemes(
    search || null,
    sort,
    limit,
    offset,
  );
  const items = rows.map(rowToMeme);

  ctx.response.body = { items, total, page, pageSize: limit };
});

router.post("/api/memes", async (ctx) => {
  const body = ctx.request.body;
  const value = body ? await body.json() : {};
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const tags = Array.isArray(value?.tags)
    ? value.tags
      .filter((t: unknown) => typeof t === "string")
      .map((t: string) => t.trim())
      .filter(Boolean)
    : [];
  const imageDataUrl = typeof value?.imageDataUrl === "string"
    ? value.imageDataUrl
    : "";

  if (!title || !imageDataUrl) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Missing title or image" };
    return;
  }

  const used = await storageDb.getStorageUsedBytes();
  const max = storageDb.getMaxStorageBytes();
  if (used + imageDataUrl.length > max) {
    ctx.response.status = 413;
    ctx.response.body = { ok: false, error: "Storage limit exceeded" };
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();
  await memesDb.insertMeme(id, title, tags, imageDataUrl, createdAt);

  ctx.response.body = {
    ok: true,
    item: { id, title, tags, imageDataUrl, createdAt: createdAt.getTime() },
  };
});

router.get("/api/memes/:id", async (ctx) => {
  const id = ctx.params.id;
  if (!id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing id" };
    return;
  }
  const row = await memesDb.getMemeById(id);
  if (!row) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
    return;
  }
  ctx.response.body = rowToMeme(row);
});

router.put("/api/memes/:id", async (ctx) => {
  const id = ctx.params.id;
  if (!id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing id" };
    return;
  }
  const body = ctx.request.body;
  const value = body ? await body.json() : {};
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const tags = Array.isArray(value?.tags)
    ? value.tags
      .filter((t: unknown) => typeof t === "string")
      .map((t: string) => t.trim())
      .filter(Boolean)
    : [];
  const imageDataUrl = typeof value?.imageDataUrl === "string"
    ? value.imageDataUrl
    : null;

  if (!title) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Missing title" };
    return;
  }

  const existed = await memesDb.getMemeById(id);
  if (!existed) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
    return;
  }

  const ok = await memesDb.updateMeme(
    id,
    title,
    tags,
    imageDataUrl ?? existed.imageDataUrl,
  );
  if (!ok) {
    ctx.response.status = 500;
    ctx.response.body = { ok: false, error: "Update failed" };
    return;
  }

  const row = await memesDb.getMemeById(id);
  ctx.response.body = { ok: true, item: row ? rowToMeme(row) : null };
});

router.delete("/api/memes/:id", async (ctx) => {
  const id = ctx.params.id;
  if (!id) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing id" };
    return;
  }
  const ok = await memesDb.deleteMeme(id);
  if (!ok) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
    return;
  }
  ctx.response.body = { ok: true };
});

router.get("/api/storage", async (ctx) => {
  const usedBytes = await storageDb.getStorageUsedBytes();
  const maxBytes = storageDb.getMaxStorageBytes();
  ctx.response.body = { usedBytes, maxBytes };
});

export default router;
