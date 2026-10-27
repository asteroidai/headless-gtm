import { describe, expect, it } from "vitest";
import { cronMatches } from "../src/cron.ts";

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

  it("rejects a malformed expression", () => {
    expect(() => cronMatches("0 9 *", new Date())).toThrow(/bad cron/);
  });
});
