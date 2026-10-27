import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { bearer, requireAdmin } from "../auth.ts";
import { getJob, listJobs } from "../jobs.ts";
import { complete, enqueue, readLog } from "../queue.ts";
import { parseCompletion } from "../writes.ts";

export const MAX_BODY_BYTES = 1024 * 1024;

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

  // Only a known id reaches the filesystem, so the path cannot leave data/jobs/.
  app.get("/:id/log", (c) => {
    const job = getJob(c.req.param("id"));
    const log = job ? readLog(job.id) : null;
    return log === null ? c.text("no log", 404) : c.text(log);
  });

  /** The agent's POST-back. Needs the per-job token from its payload file. */
  app.post("/:id/complete", bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    const job = getJob(c.req.param("id"));
    if (!job) return c.json({ ok: false, error: "not found" }, 404);
    if (bearer(c) !== job.token) return c.json({ ok: false, error: "unauthorized" }, 401);
    if (job.status !== "running") return c.json({ ok: false, error: `job is ${job.status}` }, 409);
    let body;
    try {
      body = parseCompletion(await c.req.json().catch(() => null));
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
    const done = await complete(job.id, body);
    return done ? c.json({ ok: true, job: publicJob(done) }) : c.json({ ok: false, error: "already completing" }, 409);
  });

  return app;
}

function publicJob<T extends { token: string }>(job: T): Omit<T, "token"> {
  const { token: _token, ...rest } = job;
  return rest;
}
