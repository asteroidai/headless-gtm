import { describe, expect, it } from "vitest";
import { KEEP, createJob, listJobs, resetJobs, updateJob } from "../src/jobs.ts";

describe("jobs", () => {
  it("keeps queued and running jobs when it trims old ones", () => {
    resetJobs();
    const queued = createJob("x", {});
    const running = createJob("x", {});
    updateJob(running.id, { status: "running" });
    for (let i = 0; i < KEEP + 5; i++) updateJob(createJob("x", {}).id, { status: "done" });
    const ids = listJobs(KEEP * 2).map((j) => j.id);
    expect(ids).toHaveLength(KEEP);
    expect(ids).toContain(queued.id);
    expect(ids).toContain(running.id);
  });
});
