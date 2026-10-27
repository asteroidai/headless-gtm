import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";

describe("config", () => {
  it("fills defaults", () => {
    const cfg = parseConfig("");
    expect(cfg.port).toBe(5005);
    expect(cfg.claude).toEqual({ concurrency: 2, timeoutMinutes: 10, maxTurns: 60 });
    expect(cfg.integrations).toEqual([]);
  });

  it("parses a full config", () => {
    const cfg = parseConfig(`
port: 6000
claude: { concurrency: 3, timeout_minutes: 5, max_turns: 20 }
integrations: [cal-com, github-stargazers]
on:
  cal-com.booking.created: pre-demo-brief
schedules:
  - { name: stars, cron: "0 9 * * *", pull: github-stargazers }
  - { name: digest, cron: "0 8 * * 1", skill: daily-digest, input: { days: 7 } }
settings:
  github-stargazers: { repos: [a/b] }
`);
    expect(cfg.port).toBe(6000);
    expect(cfg.claude.timeoutMinutes).toBe(5);
    expect(cfg.on["cal-com.booking.created"]).toBe("pre-demo-brief");
    expect(cfg.schedules[1]?.input).toEqual({ days: 7 });
    expect(cfg.settings["github-stargazers"]?.repos).toEqual(["a/b"]);
  });

  it("rejects a route to an integration that is not enabled", () => {
    expect(() => parseConfig("on: { signup.created: research-company }")).toThrow(/not enabled/);
  });

  it("rejects a schedule with neither pull nor skill, or a bad cron", () => {
    expect(() => parseConfig('schedules: [{ name: x, cron: "* * * * *" }]')).toThrow(/pull or a skill/);
    expect(() => parseConfig('schedules: [{ name: x, cron: "* *", skill: s }]')).toThrow(/bad cron/);
  });
});
