import { fetchJson, obj, str } from "../../src/http.ts";
import { makeSignal } from "../../src/signals.ts";
import type { Integration, PullContext, Signal } from "../../src/types.ts";

export interface Mention {
  source: "hn" | "reddit";
  keyword: string;
  title: string;
  url: string;
  author?: string;
  createdAt: string;
  snippet?: string;
}

const UA = { "user-agent": "headless-gtm/0.1 (keyword digest)" };

export async function searchHn(keyword: string, sinceSec: number): Promise<Mention[]> {
  const q = new URLSearchParams({ query: keyword, tags: "(story,comment)", numericFilters: `created_at_i>${sinceSec}`, hitsPerPage: "50" });
  const res = await fetchJson<{ hits: Array<Record<string, unknown>> }>(`https://hn.algolia.com/api/v1/search_by_date?${q}`, { headers: UA });
  return res.hits.map((h) => ({
    source: "hn",
    keyword,
    title: str(h.title) ?? str(h.story_title) ?? "(comment)",
    url: str(h.url) ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    author: str(h.author),
    createdAt: str(h.created_at) ?? new Date(Number(h.created_at_i) * 1000).toISOString(),
    snippet: strip(str(h.comment_text) ?? str(h.story_text))?.slice(0, 280),
  }));
}

export async function searchReddit(keyword: string, sinceSec: number, subreddits: string[]): Promise<Mention[]> {
  const base = subreddits.length ? `https://www.reddit.com/r/${subreddits.join("+")}/search.json?restrict_sr=1&` : "https://www.reddit.com/search.json?";
  const q = new URLSearchParams({ q: `"${keyword}"`, sort: "new", t: "week", limit: "50" });
  const res = await fetchJson<{ data: { children: Array<{ data: Record<string, unknown> }> } }>(`${base}${q}`, { headers: UA });
  return res.data.children
    .map((c) => c.data)
    .filter((d) => Number(d.created_utc) > sinceSec)
    .map((d) => ({
      source: "reddit" as const,
      keyword,
      title: str(d.title) ?? "(post)",
      url: `https://www.reddit.com${str(d.permalink) ?? ""}`,
      author: str(d.author),
      createdAt: new Date(Number(d.created_utc) * 1000).toISOString(),
      snippet: str(d.selftext)?.slice(0, 280),
    }));
}

export async function pull(ctx: PullContext): Promise<Signal[]> {
  const keywords = Array.isArray(ctx.settings.keywords) ? (ctx.settings.keywords as string[]) : [];
  if (!keywords.length) throw new Error("settings.hn-reddit-keywords.keywords is empty");
  const subreddits = Array.isArray(ctx.settings.subreddits) ? (ctx.settings.subreddits as string[]) : [];
  const maxItems = Number(ctx.settings.max_items ?? 40);
  const now = Math.floor(Date.now() / 1000);
  const since = Number(ctx.state.since ?? now - 86_400);

  const seen = new Set<string>();
  const items: Mention[] = [];
  for (const kw of keywords) {
    const results = await Promise.allSettled([searchHn(kw, since), searchReddit(kw, since, subreddits)]);
    for (const r of results) {
      if (r.status === "rejected") {
        console.warn(`[hn-reddit-keywords] ${kw}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        continue;
      }
      for (const m of r.value) if (!seen.has(m.url)) seen.add(m.url) && items.push(m);
    }
  }
  ctx.state.since = now;
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!items.length) return [];
  return [makeSignal("hn-reddit-keywords", "hn-reddit-keywords.mentions.found", {}, { keywords, items: items.slice(0, maxItems) })];
}

function strip(html?: string): string | undefined {
  return html?.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
}

const integration: Integration = { pull };
export default integration;
