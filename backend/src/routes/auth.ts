import { Router } from "oak";
import * as authDb from "../db/auth.ts";
import { getAuthToken, UUID_RE } from "../helpers.ts";

const router = new Router();

const guestPassword = Deno.env.get("PASSWORD") ?? "";
if (!guestPassword) {
  console.warn("PASSWORD is not set; all logins will fail.");
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

router.get("/api/auth/check", async (ctx) => {
  const raw = getAuthToken(ctx) ?? (await ctx.cookies.get("guest_auth"));
  const token = raw && UUID_RE.test(raw) ? raw : null;
  const ok = token ? await authDb.hasAuthToken(token) : false;
  ctx.response.body = { ok };
});

router.post("/api/auth/login", async (ctx) => {
  if (!guestPassword) {
    ctx.response.status = 500;
    ctx.response.body = { ok: false, error: "Missing server password" };
    return;
  }

  const ip = ctx.request.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= LOGIN_RATE_LIMIT) {
    ctx.response.status = 429;
    ctx.response.body = { ok: false, error: "Too many attempts, try later" };
    return;
  }
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
  } else {
    entry.count++;
  }

  const body = ctx.request.body;
  const value = body ? await body.json() : {};
  const password = typeof value?.password === "string" ? value.password : "";

  if (password !== guestPassword) {
    ctx.response.status = 401;
    ctx.response.body = { ok: false };
    return;
  }

  await authDb.cleanupAuthTokens();

  const token = crypto.randomUUID();
  await authDb.addAuthToken(token);
  ctx.cookies.set("guest_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  ctx.response.body = { ok: true, token };
});

router.post("/api/auth/logout", async (ctx) => {
  const raw = getAuthToken(ctx) ?? (await ctx.cookies.get("guest_auth"));
  const token = raw && UUID_RE.test(raw) ? raw : null;
  if (token) {
    await authDb.removeAuthToken(token);
  }
  ctx.cookies.set("guest_auth", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  ctx.response.body = { ok: true };
});

export default router;
