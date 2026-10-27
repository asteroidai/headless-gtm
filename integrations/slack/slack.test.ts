import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import integration from "./index.ts";

const fixture = readFileSync(resolve(import.meta.dirname, "fixtures/post-message.json"), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("slack", () => {
  it("posts to the default channel without link previews", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_CHANNEL = "#gtm";
    const fetchMock = vi.fn(async () => new Response(fixture, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await integration.actions!.post!({ text: "hello" }, {});
    expect(out).toEqual({ channel: "C0000000000", ts: "1773130000.000100" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ channel: "#gtm", text: "hello", unfurl_links: false });
  });

  it("turns a Slack error into a thrown error", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":false,"error":"channel_not_found"}', { status: 200 })));
    await expect(integration.actions!.post!({ text: "x", channel: "#nope" }, {})).rejects.toThrow("channel_not_found");
  });
});
