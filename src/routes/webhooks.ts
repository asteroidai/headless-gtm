import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Config } from "../config.ts";
import { getIntegration } from "../integrations.ts";
import { dispatch } from "../pulls.ts";
import { MAX_BODY_BYTES } from "./jobs.ts";

/** `POST /webhooks/:source`. The integration verifies and normalises; the config routes. */
export function webhookRoutes(cfg: Config): Hono {
  const app = new Hono();
  app.post("/:source", bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    const source = c.req.param("source");
    const integration = getIntegration(source);
    if (!integration?.handle) return c.json({ ok: false, error: "unknown source" }, 404);

    const rawBody = await c.req.text();
    let body: unknown = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return c.json({ ok: false, error: "invalid JSON" }, 400);
    }
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

    const signals = await integration.handle({ headers, query: c.req.query(), rawBody, body }, cfg.settings[source] ?? {});
    if (signals === null) return c.json({ ok: false, error: "unauthorized" }, 401);
    const jobs = dispatch(cfg, signals);
    return c.json({ ok: true, signals: signals.length, jobs });
  });
  return app;
}
