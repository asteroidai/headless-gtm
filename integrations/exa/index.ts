import { requireEnv } from "../../src/env.ts";
import { fetchJson } from "../../src/http.ts";
import type { Integration } from "../../src/types.ts";

interface ExaResult {
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
}

function call<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(`https://api.exa.ai${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": requireEnv("EXA_API_KEY") },
    body: JSON.stringify(body),
  });
}

function compact(r: ExaResult) {
  return { title: r.title, url: r.url, publishedDate: r.publishedDate, author: r.author, text: r.text?.slice(0, 3000), highlights: r.highlights };
}

const integration: Integration = {
  actions: {
    /** { query, num_results?, include_domains?, start_published_date? } */
    async search(input) {
      const res = await call<{ results: ExaResult[] }>("/search", {
        query: String(input.query ?? ""),
        numResults: Number(input.num_results ?? 8),
        type: "auto",
        includeDomains: input.include_domains,
        startPublishedDate: input.start_published_date,
        contents: { highlights: { numSentences: 3 } },
      });
      return res.results.map(compact);
    },
    /** { urls: string[] } -> page text */
    async contents(input) {
      const res = await call<{ results: ExaResult[] }>("/contents", { urls: input.urls, text: { maxCharacters: 6000 } });
      return res.results.map(compact);
    },
  },
};

export default integration;
