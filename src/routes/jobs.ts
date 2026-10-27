import { Hono } from "hono";
import { bearer, requireAdmin } from "../auth.ts";
import { getJob, listJobs } from "../jobs.ts";
import { complete, enqueue, readLog } from "../queue.ts";
import { parseCompletion } from "../writes.ts";

export function jobRoutes(): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json({ ok: true, jobs: listJobs(Number(c.req.query("limit") ?? 100)).map(publicJob) }));

  app.post("/run", requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { skill?: string; input?: Record<string, unknown> } | null;
    if (!body?.skill || !/^[a-z0-9-]+$/.test(body.skill)) return c.json({ ok: false, error: "skill is required" }, 400);
    const job = enqueue(body.skill, body.input ?? {});
    return c.json({ ok: true, job: publicJob(job) });
  });

  app.get("/:id", (c) => {
    const job = getJob(c.req.param("id"));
    return job ? c.json({ ok: true, job: publicJob(job) }) : c.json({ ok: false, error: "not found" }, 404);
  });

  app.get("/:id/log", (c) => {
    const log = readLog(c.req.param("id"));
    return log === null ? c.text("no log", 404) : c.text(log);
  });

  /** The agent's POST-back. Needs the per-job token from its payload file. */
  app.post("/:id/complete", async (c) => {
    const job = getJob(c.req.param("id"));
    if (!job) return c.json({ ok: false, error: "not found" }, 404);
    if (bearer(c) !== job.token) return c.json({ ok: false, error: "unauthorized" }, 401);
    if (job.status === "done") return c.json({ ok: false, error: "already completed" }, 409);
    try {
      const body = parseCompletion(await c.req.json().catch(() => null));
      return c.json({ ok: true, job: publicJob(await complete(job.id, body)) });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return app;
}

function publicJob<T extends { token: string }>(job: T): Omit<T, "token"> {
  const { token: _token, ...rest } = job;
  return rest;
}
