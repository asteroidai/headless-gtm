import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import integration, { parse, verify } from "./index.ts";

const raw = readFileSync(resolve(import.meta.dirname, "fixtures/booking-created.json"), "utf8");

describe("cal-com", () => {
  it("rejects a bad or missing signature", () => {
    expect(verify(raw, undefined, "s3cret")).toBe(false);
    expect(verify(raw, "abc", "s3cret")).toBe(false);
    expect(verify(raw, "0".repeat(64), "s3cret")).toBe(false);
  });

  it("accepts the signature it produces", () => {
    process.env.CALCOM_WEBHOOK_SECRET = "s3cret";
    const { headers } = integration.sign!(raw);
    expect(verify(raw, headers!["x-cal-signature-256"], "s3cret")).toBe(true);
  });

  it("normalises a booking to one signal", () => {
    const [s] = parse(JSON.parse(raw));
    expect(s?.event).toBe("cal-com.booking.created");
    expect(s?.subject).toMatchObject({ email: "sam.rivera@example-health.com", name: "Sam Rivera", domain: "example-health.com" });
    expect(s?.payload.notes).toContain("payer portal");
    expect(s?.payload.startTime).toBe("2026-03-12T16:00:00.000Z");
  });

  it("ignores other trigger events", () => {
    expect(parse({ triggerEvent: "BOOKING_CANCELLED", payload: {} })).toEqual([]);
  });
});
