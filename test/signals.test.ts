import { describe, expect, it } from "vitest";
import { domainOf, makeSignal, routeFor } from "../src/signals.ts";

describe("signals", () => {
  it("builds a signal and drops empty subject fields", () => {
    const s = makeSignal("signup", "signup.created", { email: "a@b.com", name: undefined }, { plan: "free" });
    expect(s.subject).toEqual({ email: "a@b.com" });
    expect(s.payload).toEqual({ plan: "free" });
    expect(s.id).toHaveLength(36);
  });

  it("requires the event to carry the source prefix", () => {
    expect(() => makeSignal("signup", "booking.created", {})).toThrow(/must start with/);
  });

  it("routes by exact event name", () => {
    const on = { "signup.created": "research-company" };
    expect(routeFor(on, "signup.created")).toBe("research-company");
    expect(routeFor(on, "signup.deleted")).toBeNull();
  });

  it("treats free-mail as no domain", () => {
    expect(domainOf("x@gmail.com")).toBeUndefined();
    expect(domainOf("x@Example.com")).toBe("example.com");
  });
});
