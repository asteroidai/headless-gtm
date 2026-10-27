import { Hono } from "hono";
import { requireAdmin } from "../auth.ts";
import { authStatus, rotateToken } from "../claude-auth.ts";
import type { Config } from "../config.ts";
import { getDraft, listDrafts } from "../drafts.ts";
import { disabledIntegrations, enabledIntegrations } from "../integrations.ts";
import { runPull, runSchedule } from "../pulls.ts";
import { poolStatus } from "../queue.ts";

export function adminRoutes(cfg: Config): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, pool: poolStatus() }));

  app.get("/integrations", requireAdmin, (c) =>
    c.json({
      ok: true,
      integrations: enabledIntegrations().map((i) => i.manifest),
      disabled: disabledIntegrations(),
      on: cfg.on,
      schedules: cfg.schedules,
    }),
  );

  app.post("/pulls/:name/run", requireAdmin, async (c) => {
    try {
      const r = await runPull(cfg, c.req.param("name")!);
      return c.json({ ok: true, signals: r.signals.length, jobs: r.jobs });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post("/schedules/:name/run", requireAdmin, async (c) => {
    try {
      await runSchedule(cfg, c.req.param("name")!);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get("/drafts", requireAdmin, (c) => c.json({ ok: true, drafts: listDrafts() }));
  app.get("/drafts/:id", requireAdmin, (c) => {
    const d = getDraft(c.req.param("id")!);
    return d ? c.json({ ok: true, draft: d }) : c.json({ ok: false, error: "not found" }, 404);
  });

  app.get("/admin/claude-auth", requireAdmin, async (c) => c.json(await authStatus()));
  app.post("/admin/claude-auth", requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: string } | null;
    try {
      rotateToken(body?.token ?? "");
      return c.json(await authStatus());
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return app;
}
