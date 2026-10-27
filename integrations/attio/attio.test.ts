import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import integration, { splitName } from "./index.ts";

const fixture = readFileSync(resolve(import.meta.dirname, "fixtures/company.json"), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("attio", () => {
  it("upserts a company by domain", async () => {
    process.env.ATTIO_API_KEY = "attio-test";
    const fetchMock = vi.fn(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await integration.actions!["upsert-company"]!({ domain: "example-health.com", name: "Example Health" }, {});
    expect(out).toMatchObject({ id: "11111111-1111-1111-1111-111111111111", name: "Example Health", domain: "example-health.com" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.attio.com/v2/objects/companies/records?matching_attribute=domains");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ data: { values: { domains: [{ domain: "example-health.com" }], name: "Example Health" } } });
  });

  it("links a person to a company by domain", async () => {
    process.env.ATTIO_API_KEY = "attio-test";
    const fetchMock = vi.fn(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await integration.actions!["upsert-person"]!({ email: "sam@example-health.com", name: "Sam Rivera", company_domain: "example-health.com" }, {});
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const values = JSON.parse(String(init.body)).data.values;
    expect(values.name).toEqual([{ first_name: "Sam", last_name: "Rivera", full_name: "Sam Rivera" }]);
    expect(values.company[0]).toMatchObject({ target_object: "companies" });
  });

  it("splits names", () => {
    expect(splitName("Ada")).toEqual([{ first_name: "Ada", last_name: "", full_name: "Ada" }]);
    expect(splitName(undefined)).toBeUndefined();
  });

  it("surfaces API errors with the status", async () => {
    process.env.ATTIO_API_KEY = "attio-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"bad"}', { status: 400 })));
    await expect(integration.actions!["find-company"]!({ domain: "x.com" }, {})).rejects.toThrow("400");
  });
});
