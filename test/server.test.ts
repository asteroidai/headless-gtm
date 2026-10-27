import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";
import { loadIntegrations } from "../src/integrations.ts";
import { getJob, resetJobs } from "../src/jobs.ts";
import { configureQueue } from "../src/queue.ts";
import { createApp } from "../src/server.ts";
import { configureWrites } from "../src/writes.ts";
import signup from "../integrations/signup/index.ts";

const cfg = parseConfig(`
integrations: [signup, slack]
on: { signup.created: research-company }
`);
const app = createApp(cfg);
const fixture = readFileSync(resolve(import.meta.dirname, "../integrations/signup/fixtures/signup.json"), "utf8");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(id: string, status: string) {
  for (let i = 0; i < 50; i++) {
    if (getJob(id)?.status === status) return getJob(id)!;
    await sleep(50);
  }
  throw new Error(`job ${id} never reached ${status}: ${getJob(id)?.status}`);
}

beforeAll(async () => {
  process.env.CLAUDE_BIN = resolve(import.meta.dirname, "fake-claude.sh");
  process.env.SIGNUP_SECRET = "shh";
  process.env.ADMIN_TOKEN = "admin";
  delete process.env.SLACK_BOT_TOKEN;
  resetJobs();
  configureQueue(cfg);
  configureWrites(cfg.settings);
  await loadIntegrations(cfg.integrations);
});

describe("server", () => {
  it("answers healthz", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("404s an unknown webhook source and 401s a bad secret", async () => {
    expect((await app.request("/webhooks/nope", { method: "POST", body: "{}" })).status).toBe(404);
    const bad = await app.request("/webhooks/signup", { method: "POST", body: fixture, headers: { "x-signup-secret": "wrong" } });
    expect(bad.status).toBe(401);
  });

  it("turns a verified webhook into a job that runs to done", async () => {
    const res = await app.request("/webhooks/signup", { method: "POST", body: fixture, headers: signup.sign!(fixture).headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signals: 1, jobs: 1 });
    const list = (await (await app.request("/jobs")).json()) as { jobs: Array<{ id: string; skill: string; token?: string }> };
    const job = list.jobs[0]!;
    expect(job.skill).toBe("research-company");
    expect(job.token).toBeUndefined();
    const done = await waitFor(job.id, "done");
    expect(done.summary).toMatch(/^ran \/research-company /);
    expect(done.signal?.subject.email).toBe("priya@example-logistics.com");
  });

  it("guards /jobs/run with the admin token", async () => {
    const body = JSON.stringify({ skill: "daily-digest" });
    expect((await app.request("/jobs/run", { method: "POST", body })).status).toBe(401);
    const ok = await app.request("/jobs/run", { method: "POST", body, headers: { authorization: "Bearer admin" } });
    expect(ok.status).toBe(200);
    const { job } = (await ok.json()) as { job: { id: string } };
    await waitFor(job.id, "done");
  });

  it("accepts a completion with the job token, stores drafts, reports failed writes", async () => {
    const run = await app.request("/jobs/run", { method: "POST", body: JSON.stringify({ skill: "draft-first-email" }), headers: { authorization: "Bearer admin" } });
    const { job } = (await run.json()) as { job: { id: string } };
    const token = getJob(job.id)!.token;
    const completion = {
      summary: "drafted one email",
      drafts: [{ kind: "email", to: "priya@example-logistics.com", subject: "hi", body: "..." }],
      writes: [{ integration: "slack", action: "post", input: { text: "x" } }],
    };
    const bad = await app.request(`/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify(completion), headers: { authorization: "Bearer nope" } });
    expect(bad.status).toBe(401);
    const res = await app.request(`/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify(completion), headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const done = getJob(job.id)!;
    expect(done.status).toBe("done");
    expect(done.draftIds).toHaveLength(1);
    expect(done.writes?.[0]).toMatchObject({ ok: false, error: expect.stringMatching(/SLACK_BOT_TOKEN/) });
    const again = await app.request(`/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify(completion), headers: { authorization: `Bearer ${token}` } });
    expect(again.status).toBe(409);
    const drafts = (await (await app.request("/drafts")).json()) as { drafts: Array<{ to: string }> };
    expect(drafts.drafts.some((d) => d.to === "priya@example-logistics.com")).toBe(true);
  });

  it("rejects a completion without a summary", async () => {
    const run = await app.request("/jobs/run", { method: "POST", body: JSON.stringify({ skill: "x" }), headers: { authorization: "Bearer admin" } });
    const { job } = (await run.json()) as { job: { id: string } };
    const res = await app.request(`/jobs/${job.id}/complete`, { method: "POST", body: "{}", headers: { authorization: `Bearer ${getJob(job.id)!.token}` } });
    expect(res.status).toBe(400);
  });
});
