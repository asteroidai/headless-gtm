import { env, requireEnv } from "../../src/env.ts";
import { fetchJson } from "../../src/http.ts";
import type { Integration } from "../../src/types.ts";

interface PostResponse {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

const integration: Integration = {
  actions: {
    /** { text, channel?, thread_ts? }. Returns { channel, ts } for threading. */
    async post(input) {
      const res = await fetchJson<PostResponse>("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${requireEnv("SLACK_BOT_TOKEN")}` },
        body: JSON.stringify({
          channel: String(input.channel ?? env("SLACK_CHANNEL") ?? ""),
          text: String(input.text ?? ""),
          thread_ts: input.thread_ts,
          unfurl_links: false,
          unfurl_media: false,
        }),
      });
      if (!res.ok) throw new Error(`slack: ${res.error ?? "unknown error"}`);
      return { channel: res.channel, ts: res.ts };
    },
  },
};

export default integration;
