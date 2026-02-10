import { Router } from "oak";
import * as memesDb from "../db/memes.ts";
import * as storageDb from "../db/storage.ts";
import { mimeFromPath, rowToMeme } from "../helpers.ts";

const UPLOAD_DIR = Deno.env.get("UPLOAD_DIR") ?? "/data/uploads";

const ALLOWED_EXT = new Set([
  "png",
  "gif",
  "mp4",
  "webm",
]);

function extFromFile(file: File): string | null {
  const nameExt = file.name.split(".").pop()?.toLowerCase();
  if (nameExt && ALLOWED_EXT.has(nameExt)) return nameExt;
  const mimeMap: Record<string, string> = {
    "image/png": "png",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  const mapped = mimeMap[file.type];
  return mapped ?? null;
}

async function saveUpload(
  file: File | Blob,
  ext: string,
): Promise<{ path: string; size: number }> {
  const filename = `${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await Deno.writeFile(`${UPLOAD_DIR}/${filename}`, bytes);
  return { path: filename, size: bytes.length };
}

async function deleteFile(path: string): Promise<void> {
  try {
    await Deno.remove(`${UPLOAD_DIR}/${path}`);
  } catch {
    // ignore
  }
}

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
  const formData = await ctx.request.body.formData();

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  let tags: string[] = [];
  try {
    const raw = formData.get("tags") as string | null;
    if (raw) {
      const parsed = JSON.parse(raw);
      tags = Array.isArray(parsed)
        ? parsed.filter((t: unknown) => typeof t === "string").map((
          t: string,
        ) => t.trim()).filter(Boolean)
        : [];
    }
  } catch {
    tags = [];
  }
  const mediaFile = formData.get("file") as File | null;
  const thumbFile = formData.get("thumbnail") as File | null;

  if (!title || !mediaFile || mediaFile.size === 0) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Missing title or file" };
    return;
  }

  if (title.length > 200) {
    ctx.response.status = 400;
    ctx.response.body = {
      ok: false,
      error: "Title must be 200 characters or less",
    };
    return;
  }
  if (tags.length > 20) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Maximum 20 tags allowed" };
    return;
  }
  if (tags.some((t) => t.length > 100)) {
    ctx.response.status = 400;
    ctx.response.body = {
      ok: false,
      error: "Each tag must be 100 characters or less",
    };
    return;
  }

  const ext = extFromFile(mediaFile);
  if (!ext) {
    ctx.response.status = 400;
    ctx.response.body = {
      ok: false,
      error: "Unsupported file format. Allowed: PNG, GIF, MP4, WebM",
    };
    return;
  }

  const used = await storageDb.getStorageUsedBytes();
  const max = storageDb.getMaxStorageBytes();
  if (used + mediaFile.size > max) {
    ctx.response.status = 413;
    ctx.response.body = { ok: false, error: "Storage limit exceeded" };
    return;
  }

  const { path: filePath, size: fileSize } = await saveUpload(mediaFile, ext);
  let thumbnailPath: string | null = null;

  if (thumbFile && thumbFile.size > 0) {
    try {
      const thumb = await saveUpload(thumbFile, "png");
      thumbnailPath = thumb.path;
    } catch {
      // ignore thumbnail failure
    }
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();

  try {
    await memesDb.insertMeme(
      id,
      title,
      tags,
      filePath,
      thumbnailPath,
      fileSize,
      createdAt,
    );
  } catch (err) {
    await deleteFile(filePath);
    if (thumbnailPath) await deleteFile(thumbnailPath);
    throw err;
  }

  ctx.response.body = {
    ok: true,
    item: {
      id,
      title,
      tags,
      filePath,
      thumbnailPath,
      fileSize,
      createdAt: createdAt.getTime(),
    },
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

  const formData = await ctx.request.body.formData();

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  let tags: string[] = [];
  try {
    const raw = formData.get("tags") as string | null;
    if (raw) {
      const parsed = JSON.parse(raw);
      tags = Array.isArray(parsed)
        ? parsed.filter((t: unknown) => typeof t === "string").map((
          t: string,
        ) => t.trim()).filter(Boolean)
        : [];
    }
  } catch {
    tags = [];
  }
  const mediaFile = formData.get("file") as File | null;
  const thumbFile = formData.get("thumbnail") as File | null;

  if (!title) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Missing title" };
    return;
  }
  if (title.length > 200) {
    ctx.response.status = 400;
    ctx.response.body = {
      ok: false,
      error: "Title must be 200 characters or less",
    };
    return;
  }
  if (tags.length > 20) {
    ctx.response.status = 400;
    ctx.response.body = { ok: false, error: "Maximum 20 tags allowed" };
    return;
  }
  if (tags.some((t) => t.length > 100)) {
    ctx.response.status = 400;
    ctx.response.body = {
      ok: false,
      error: "Each tag must be 100 characters or less",
    };
    return;
  }

  const existed = await memesDb.getMemeById(id);
  if (!existed) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
    return;
  }

  let newFilePath: string | undefined;
  let newThumbnailPath: string | null | undefined;
  let newFileSize: number | undefined;

  if (mediaFile && mediaFile.size > 0) {
    const ext = extFromFile(mediaFile);
    if (!ext) {
      ctx.response.status = 400;
      ctx.response.body = {
        ok: false,
        error: "Unsupported file format. Allowed: PNG, GIF, MP4, WebM",
      };
      return;
    }

    const used = await storageDb.getStorageUsedBytes();
    const max = storageDb.getMaxStorageBytes();
    if (used - existed.fileSize + mediaFile.size > max) {
      ctx.response.status = 413;
      ctx.response.body = { ok: false, error: "Storage limit exceeded" };
      return;
    }
    const saved = await saveUpload(mediaFile, ext);
    newFilePath = saved.path;
    newFileSize = saved.size;

    if (thumbFile && thumbFile.size > 0) {
      try {
        const thumb = await saveUpload(thumbFile, "png");
        newThumbnailPath = thumb.path;
      } catch {
        newThumbnailPath = null;
      }
    } else {
      newThumbnailPath = null;
    }
  }

  const ok = await memesDb.updateMeme(
    id,
    title,
    tags,
    newFilePath,
    newThumbnailPath,
    newFileSize,
  );
  if (!ok) {
    if (newFilePath) await deleteFile(newFilePath);
    if (newThumbnailPath) await deleteFile(newThumbnailPath);
    ctx.response.status = 500;
    ctx.response.body = { ok: false, error: "Update failed" };
    return;
  }

  if (newFilePath && existed.filePath) {
    await deleteFile(existed.filePath);
  }
  if (newThumbnailPath !== undefined && existed.thumbnailPath) {
    await deleteFile(existed.thumbnailPath);
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
  const row = await memesDb.getMemeById(id);
  const ok = await memesDb.deleteMeme(id);
  if (!ok) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Not found" };
    return;
  }
  if (row?.filePath) {
    await deleteFile(row.filePath);
  }
  if (row?.thumbnailPath) {
    await deleteFile(row.thumbnailPath);
  }
  ctx.response.body = { ok: true };
});

router.get("/api/files/:filename", async (ctx) => {
  const filename = ctx.params.filename;
  if (
    !filename || filename.includes("..") || filename.includes("/") ||
    filename.includes("\\")
  ) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid filename" };
    return;
  }
  const diskPath = `${UPLOAD_DIR}/${filename}`;
  try {
    const stat = await Deno.stat(diskPath);
    if (!stat.isFile) throw new Error("not a file");
    const file = await Deno.readFile(diskPath);
    ctx.response.headers.set("Content-Type", mimeFromPath(filename));
    ctx.response.headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );
    ctx.response.body = file;
  } catch {
    ctx.response.status = 404;
    ctx.response.body = { error: "File not found" };
  }
});

router.get("/api/storage", async (ctx) => {
  const usedBytes = await storageDb.getStorageUsedBytes();
  const maxBytes = storageDb.getMaxStorageBytes();
  ctx.response.body = { usedBytes, maxBytes };
});

export default router;
