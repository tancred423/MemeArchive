import { Application } from "oak";
import { getAuthToken, UUID_RE } from "./helpers.ts";
import * as authDb from "./db/auth.ts";
import memeRoutes from "./routes/memes.ts";
import authRoutes from "./routes/auth.ts";

const app = new Application();
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

// Global error handler
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Unhandled error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Security headers
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  if (path.startsWith("/api")) {
    ctx.response.headers.set("X-Content-Type-Options", "nosniff");
    ctx.response.headers.set("X-Frame-Options", "DENY");
  }
  await next();
});

// Body size limit
app.use(async (ctx, next) => {
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

// Auth middleware — skip /api/auth* and the health-check /api
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  if (!path.startsWith("/api")) return await next();
  if (path === "/api" || path.startsWith("/api/auth")) return await next();

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

// Routes
app.use(memeRoutes.routes());
app.use(memeRoutes.allowedMethods());
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

const port = parseInt(Deno.env.get("PORT") ?? "8000");
const hostname = Deno.env.get("HOST") ?? "0.0.0.0";
console.log(`Server running on http://${hostname}:${port}`);
await app.listen({ port, hostname });
