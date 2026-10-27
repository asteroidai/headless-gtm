import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import integration from "./index.ts";

const fixture = readFileSync(resolve(import.meta.dirname, "fixtures/organization.json"), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("apollo", () => {
  it("enriches a company by domain and compacts the result", async () => {
    process.env.APOLLO_API_KEY = "apollo-test";
    const fetchMock = vi.fn(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await integration.actions!["enrich-company"]!({ domain: "example-health.com" }, {});
    expect(out).toMatchObject({ name: "Example Health", employees: 180, lastFunding: "Series B", location: "Austin, Texas, United States" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.apollo.io/api/v1/organizations/enrich?domain=example-health.com");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("apollo-test");
  });

  it("never asks for personal emails", async () => {
    process.env.APOLLO_API_KEY = "apollo-test";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ person: { name: "Sam Rivera", title: "COO", organization: { name: "Example Health" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await integration.actions!["enrich-person"]!({ email: "sam.rivera@example-health.com" }, {});
    expect(out).toMatchObject({ name: "Sam Rivera", company: "Example Health" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).reveal_personal_emails).toBe(false);
  });
});
