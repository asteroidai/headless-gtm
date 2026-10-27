import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runClaude, claudeEnv } from "../src/runner.ts";

const fake = resolve(import.meta.dirname, "fake-claude.sh");
const log = resolve(import.meta.dirname, "..", ".test-data", "runner.log");

beforeEach(() => {
  process.env.CLAUDE_BIN = fake;
});
afterEach(() => {
  delete process.env.FAKE_CLAUDE_MODE;
});

describe("runner", () => {
  it("captures the result line", async () => {
    const out = await runClaude({ skill: "research-company", arg: "/tmp/x.json", logPath: log, timeoutMs: 5000, maxTurns: 3 });
    expect(out.ok).toBe(true);
    expect(out.resultText).toBe("ran /research-company /tmp/x.json");
    expect(out.costUsd).toBe(0.01);
  });

  it("reports a non-zero exit with the stderr tail", async () => {
    process.env.FAKE_CLAUDE_MODE = "fail";
    const out = await runClaude({ skill: "x", arg: "", logPath: log, timeoutMs: 5000, maxTurns: 3 });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/code 1: boom/);
  });

  it("kills a run on timeout", async () => {
    process.env.FAKE_CLAUDE_MODE = "hang";
    const out = await runClaude({ skill: "x", arg: "", logPath: log, timeoutMs: 300, maxTurns: 3 });
    expect(out.timedOut).toBe(true);
    expect(out.error).toBe("killed on timeout");
  });

  it("reports a missing binary", async () => {
    process.env.CLAUDE_BIN = "/nonexistent/claude";
    const out = await runClaude({ skill: "x", arg: "", logPath: log, timeoutMs: 5000, maxTurns: 3 });
    expect(out.error).toMatch(/could not spawn claude/);
  });

  it("prefers the subscription token over the API key", () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-test";
    expect(claudeEnv().ANTHROPIC_API_KEY).toBeUndefined();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(claudeEnv().ANTHROPIC_API_KEY).toBe("sk-ant-api-test");
    delete process.env.ANTHROPIC_API_KEY;
  });
});
