import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import integration, { parse } from "./index.ts";

const raw = readFileSync(resolve(import.meta.dirname, "fixtures/visitor.json"), "utf8");

describe("rb2b", () => {
  it("normalises an identified visitor", () => {
    const [s] = parse(JSON.parse(raw));
    expect(s?.event).toBe("rb2b.visitor.identified");
    expect(s?.subject).toMatchObject({ name: "Jordan Okafor", company: "Example Clinics", domain: "example-clinics.com" });
    expect(s?.payload).toMatchObject({ title: "VP Operations", page: "https://yourco.com/pricing", repeatVisitor: true });
  });

  it("ignores a visitor with no company handle", () => {
    expect(parse({ "First Name": "Anon" })).toEqual([]);
  });

  it("checks the token in the query string", async () => {
    process.env.RB2B_TOKEN = "tok";
    const req = { headers: {}, rawBody: raw, body: JSON.parse(raw) };
    expect(await integration.handle!({ ...req, query: { token: "nope" } }, {})).toBeNull();
    expect(await integration.handle!({ ...req, query: integration.sign!(raw).query! }, {})).toHaveLength(1);
  });
});
