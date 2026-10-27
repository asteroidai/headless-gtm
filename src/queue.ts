import { readFileSync } from "node:fs";
import type { Config } from "./config.ts";
import { Pool } from "./pool.ts";
import { createJob, getJob, jobLogPath, jobPayloadPath, updateJob } from "./jobs.ts";
import { writeJson } from "./persist.ts";
import { redact, runClaude } from "./runner.ts";
import { applyCompletion } from "./writes.ts";
import type { Completion, Job, Signal } from "./types.ts";

let pool = new Pool(2);
let settings: Config["claude"] = { concurrency: 2, timeoutMinutes: 10, maxTurns: 60 };
let port = 5005;
const completing = new Set<string>();

export function configureQueue(cfg: Config): void {
  settings = cfg.claude;
  port = cfg.port;
  pool = new Pool(cfg.claude.concurrency);
}

export function poolStatus() {
  return pool.status();
}

/** Queue a skill run. Returns at once; the run happens in the background. */
export function enqueue(skill: string, input: Record<string, unknown>, signal?: Signal): Job {
  const job = createJob(skill, input, signal);
  void run(job.id);
  return job;
}

async function run(id: string): Promise<void> {
  const release = await pool.acquire();
  try {
    const job = getJob(id);
    if (!job || job.status !== "queued") return;
    const payloadPath = jobPayloadPath(job.id);
    writeJson(payloadPath, {
      jobId: job.id,
      skill: job.skill,
      token: job.token,
      completeUrl: `http://localhost:${port}/jobs/${job.id}/complete`,
      input: job.input,
      signal: job.signal ?? null,
    });
    updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });
    console.log(`[job ${job.id.slice(0, 8)}] /${job.skill} started`);

    const outcome = await runClaude({
      skill: job.skill,
      arg: payloadPath,
      logPath: jobLogPath(job.id),
      timeoutMs: settings.timeoutMinutes * 60_000,
      maxTurns: settings.maxTurns,
    });

    const after = getJob(job.id);
    if (after?.status === "done") return; // the agent completed via POST
    if (outcome.ok) {
      // No POST-back: the agent's final text is the result.
      updateJob(job.id, { status: "done", endedAt: new Date().toISOString(), summary: outcome.resultText?.slice(0, 2000), costUsd: outcome.costUsd });
      console.log(`[job ${job.id.slice(0, 8)}] done (no completion posted)`);
    } else {
      updateJob(job.id, { status: "failed", endedAt: new Date().toISOString(), error: outcome.error, costUsd: outcome.costUsd });
      console.log(`[job ${job.id.slice(0, 8)}] failed: ${outcome.error}`);
    }
  } catch (err) {
    // An unhandled rejection here would take the server down with it.
    const error = redact(err instanceof Error ? err.message : String(err));
    updateJob(id, { status: "failed", endedAt: new Date().toISOString(), error });
    console.error(`[job ${id.slice(0, 8)}] failed: ${error}`);
  } finally {
    release();
  }
}

/** The agent posted its result. Apply writes, store drafts, mark done. Null when a completion is already in flight. */
export async function complete(id: string, body: Completion): Promise<Job | null> {
  if (completing.has(id)) return null;
  completing.add(id);
  try {
    const applied = await applyCompletion(id, body);
    const job = updateJob(id, {
      status: "done",
      endedAt: new Date().toISOString(),
      summary: body.summary,
      writes: applied.writes,
      draftIds: applied.draftIds,
    })!;
    console.log(`[job ${id.slice(0, 8)}] completed: ${body.summary.slice(0, 80)}`);
    return job;
  } finally {
    completing.delete(id);
  }
}

export function readLog(id: string): string | null {
  try {
    return readFileSync(jobLogPath(id), "utf8");
  } catch {
    return null;
  }
}
