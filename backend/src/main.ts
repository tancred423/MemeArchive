import { Application } from "oak";
import { getAuthToken, UUID_RE } from "./helpers.ts";
import * as authDb from "./db/auth.ts";
import memeRoutes from "./routes/memes.ts";
import authRoutes from "./routes/auth.ts";

const UPLOAD_DIR = Deno.env.get("UPLOAD_DIR") ?? "/data/uploads";
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

try {
  await Deno.mkdir(UPLOAD_DIR, { recursive: true });
} catch {
  // ignore
}

const app = new Application();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Unhandled error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  if (path.startsWith("/api")) {
    ctx.response.headers.set("X-Content-Type-Options", "nosniff");
    ctx.response.headers.set("X-Frame-Options", "DENY");
  }
  await next();
});

app.use(async (ctx, next) => {
  const contentType = ctx.request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return await next();
  }
  const contentLength = parseInt(
    ctx.request.headers.get("content-length") ?? "0",
  );
  if (contentLength > MAX_BODY_SIZE) {
    ctx.response.status = 413;
    ctx.response.body = { error: "Request body too large" };
    return;
  }
  await next();
});

app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  if (!path.startsWith("/api")) return await next();
  if (path === "/api" || path.startsWith("/api/auth") || path.startsWith("/api/files/")) return await next();

  const raw = getAuthToken(ctx) ?? (await ctx.cookies.get("guest_auth"));
  const token = raw && UUID_RE.test(raw) ? raw : null;
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }
  const valid = await authDb.hasAuthToken(token);
  if (!valid) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }
  await authDb.touchAuthToken(token);
  await next();
});

app.use(memeRoutes.routes());
app.use(memeRoutes.allowedMethods());
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "8000");
const hostname = Deno.env.get("HOST") ?? "0.0.0.0";
console.log(`Server running on http://${hostname}:${port}`);
await app.listen({ port, hostname });
