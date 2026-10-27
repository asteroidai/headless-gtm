import { describe, expect, it, vi } from "vitest";
import { cronMatches, startCron } from "../src/cron.ts";

const at = (h: number, m: number, day = 10) => new Date(2026, 2, day, h, m); // March 2026; the 10th is a Tuesday

describe("cron", () => {
  it("matches stars, numbers, ranges, lists and steps", () => {
    expect(cronMatches("* * * * *", at(3, 4))).toBe(true);
    expect(cronMatches("0 9 * * *", at(9, 0))).toBe(true);
    expect(cronMatches("0 9 * * *", at(9, 1))).toBe(false);
    expect(cronMatches("*/15 * * * *", at(9, 30))).toBe(true);
    expect(cronMatches("*/15 * * * *", at(9, 31))).toBe(false);
    expect(cronMatches("0 8-10 * * *", at(10, 0))).toBe(true);
    expect(cronMatches("0 8,18 * * *", at(18, 0))).toBe(true);
    expect(cronMatches("0 8 * * 1-5", at(8, 0, 10))).toBe(true);
    expect(cronMatches("0 8 * * 1-5", at(8, 0, 14))).toBe(false); // Saturday
  });

  it("treats 7 as Sunday", () => {
    expect(cronMatches("0 8 * * 7", at(8, 0, 15))).toBe(true); // the 15th is a Sunday
    expect(cronMatches("0 8 * * 0", at(8, 0, 15))).toBe(true);
    expect(cronMatches("0 8 * * 7", at(8, 0, 10))).toBe(false);
  });

  it("rejects a malformed expression instead of never matching", () => {
    for (const bad of ["0 9 *", "x 9 * * *", "0 25 * * *", "0 9 * * 1-9", "*/0 * * * *", "0 9 * * 1-2-3", "0 9 1,,2 * *"]) {
      expect(() => cronMatches(bad, new Date()), bad).toThrow(/bad cron/);
    }
  });

  it("does not fire for the minute the server booted in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 9, 0, 1));
    const fired: string[] = [];
    const stop = startCron([{ name: "every-minute", cron: "* * * * *" }], (n) => fired.push(n));
    vi.advanceTimersByTime(30_000);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(fired).toEqual(["every-minute"]);
    stop();
    vi.useRealTimers();
  });
});
