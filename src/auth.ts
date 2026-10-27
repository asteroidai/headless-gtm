import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { env } from "./env.ts";

/**
 * Admin and read routes need ADMIN_TOKEN when it is set: `Authorization: Bearer <token>`,
 * or HTTP Basic with the token as the password, so a browser can open the dashboard.
 */
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const token = env("ADMIN_TOKEN");
  if (!token || presented(c).some((t) => safeEqual(t, token))) return next();
  c.header("WWW-Authenticate", 'Basic realm="headless-gtm"');
  return c.json({ ok: false, error: "unauthorized" }, 401);
}

function presented(c: Context): string[] {
  const h = c.req.header("authorization") ?? "";
  if (h.startsWith("Bearer ")) return [h.slice(7)];
  if (h.startsWith("Basic ")) {
    const [user = "", ...rest] = Buffer.from(h.slice(6), "base64").toString().split(":");
    return [user, rest.join(":")];
  }
  return [];
}

export function bearer(c: Context): string | null {
  const h = c.req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Compare two secrets in constant time. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
