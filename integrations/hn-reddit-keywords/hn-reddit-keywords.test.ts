import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pull } from "./index.ts";

const dir = resolve(import.meta.dirname, "fixtures");
const hn = readFileSync(resolve(dir, "hn.json"), "utf8");
const reddit = readFileSync(resolve(dir, "reddit.json"), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("hn-reddit-keywords", () => {
  it("merges both sources into one signal and drops old Reddit posts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.includes("algolia") ? hn : reddit, { status: 200 })));
    const state: Record<string, unknown> = { since: 1773100000 };
    const [signal] = await pull({ settings: { keywords: ["browser agent"] }, state });
    const items = signal!.payload.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.source)).toEqual(["hn", "hn", "reddit"]);
    expect(items[1]!.snippet).toBe("We tried a browser agent for this last quarter it mostly worked.");
    expect(items[1]!.url).toBe("https://news.ycombinator.com/item?id=40000002");
    expect(typeof state.since).toBe("number");
  });

  it("survives one source failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("reddit") ? new Response("nope", { status: 429 }) : new Response(hn, { status: 200 }))));
    const [signal] = await pull({ settings: { keywords: ["browser agent"] }, state: {} });
    expect((signal!.payload.items as unknown[]).length).toBe(2);
  });

  it("emits nothing when there are no mentions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hits: [], data: { children: [] } }), { status: 200 })));
    expect(await pull({ settings: { keywords: ["x"] }, state: {} })).toEqual([]);
  });
});
