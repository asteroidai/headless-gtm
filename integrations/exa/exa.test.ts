import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import integration from "./index.ts";

const fixture = readFileSync(resolve(import.meta.dirname, "fixtures/search.json"), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("exa", () => {
  it("sends the key and query, returns compact results", async () => {
    process.env.EXA_API_KEY = "exa-test";
    const fetchMock = vi.fn(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = (await integration.actions!.search!({ query: "Example Health funding", num_results: 2 }, {})) as Array<{ url: string }>;
    expect(out).toHaveLength(2);
    expect(out[0]!.url).toContain("series-b");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exa.ai/search");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("exa-test");
    expect(JSON.parse(String(init.body))).toMatchObject({ query: "Example Health funding", numResults: 2 });
  });

  it("fails clearly without a key", async () => {
    delete process.env.EXA_API_KEY;
    await expect(integration.actions!.search!({ query: "x" }, {})).rejects.toThrow("EXA_API_KEY");
  });
});
