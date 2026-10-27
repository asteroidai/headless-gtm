import type { Context, Next } from "hono";
import { env } from "./env.ts";

/** Admin routes need `Authorization: Bearer $ADMIN_TOKEN` when the token is set. */
export async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const token = env("ADMIN_TOKEN");
  if (!token) return next();
  if (c.req.header("authorization") !== `Bearer ${token}`) return c.json({ ok: false, error: "unauthorized" }, 401);
  return next();
}

export function bearer(c: Context): string | null {
  const h = c.req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}
