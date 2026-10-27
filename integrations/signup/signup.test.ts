import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import integration, { parse, verify } from "./index.ts";

const raw = readFileSync(resolve(import.meta.dirname, "fixtures/signup.json"), "utf8");

describe("signup", () => {
  it("checks the shared secret", () => {
    expect(verify("abc", "abc")).toBe(true);
    expect(verify("abd", "abc")).toBe(false);
    expect(verify(undefined, "abc")).toBe(false);
    expect(verify("abc", undefined)).toBe(false);
  });

  it("normalises a signup", () => {
    const [s] = parse(JSON.parse(raw));
    expect(s?.event).toBe("signup.created");
    expect(s?.subject).toEqual({ email: "priya@example-logistics.com", name: "Priya Nair", company: "Example Logistics", domain: "example-logistics.com" });
    expect(s?.payload.plan).toBe("free");
    expect(s?.occurredAt).toBe("2026-03-10T09:15:00.000Z");
  });

  it("drops free-mail domains from the subject", () => {
    const [s] = parse({ email: "someone@gmail.com" });
    expect(s?.subject.domain).toBeUndefined();
  });

  it("returns null when the secret is wrong", async () => {
    process.env.SIGNUP_SECRET = "right";
    const res = await integration.handle!({ headers: { "x-signup-secret": "wrong" }, query: {}, rawBody: raw, body: JSON.parse(raw) }, {});
    expect(res).toBeNull();
  });
});
