import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DATA_DIR } from "./env.ts";
import { readJson, writeJson } from "./persist.ts";
import type { Job, Signal } from "./types.ts";

const FILE = resolve(DATA_DIR, "jobs.json");
const KEEP = 500;

let jobs: Job[] = readJson<Job[]>(FILE, []);

/** A restart orphans whatever was in flight. Say so instead of re-running it. */
export function recoverJobs(): number {
  let n = 0;
  for (const j of jobs) {
    if (j.status === "queued" || j.status === "running") {
      j.status = "failed";
      j.error = "interrupted by restart";
      j.endedAt = new Date().toISOString();
      n++;
    }
  }
  if (n) save();
  return n;
}

export function createJob(skill: string, input: Record<string, unknown>, signal?: Signal): Job {
  const job: Job = {
    id: randomUUID(),
    skill,
    status: "queued",
    createdAt: new Date().toISOString(),
    input,
    signal,
    token: randomBytes(16).toString("hex"),
  };
  jobs.unshift(job);
  if (jobs.length > KEEP) jobs = jobs.slice(0, KEEP);
  save();
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const job = jobs.find((j) => j.id === id);
  if (!job) return undefined;
  Object.assign(job, patch);
  save();
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.find((j) => j.id === id);
}

export function listJobs(limit = 100): Job[] {
  return jobs.slice(0, limit);
}

export function jobLogPath(id: string): string {
  return resolve(DATA_DIR, "jobs", `${id}.log`);
}

export function jobPayloadPath(id: string): string {
  return resolve(DATA_DIR, "jobs", `${id}.json`);
}

/** Tests only. */
export function resetJobs(): void {
  jobs = [];
  save();
}

function save(): void {
  writeJson(FILE, jobs);
}
