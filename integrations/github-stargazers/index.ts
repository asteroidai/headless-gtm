import { env } from "../../src/env.ts";
import { fetchJson, str } from "../../src/http.ts";
import { makeSignal } from "../../src/signals.ts";
import type { Integration, PullContext, Signal } from "../../src/types.ts";

interface Star {
  starred_at: string;
  user: { login: string; html_url: string };
}
interface User {
  login: string;
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  email?: string | null;
  bio?: string | null;
  html_url: string;
  location?: string | null;
}

const API = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/vnd.github.star+json", "user-agent": "headless-gtm" };
  const token = env("GITHUB_TOKEN");
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** Stars come oldest first. Read from the last page backwards until the watermark. */
export async function newStars(repo: string, since: string | undefined, limit: number): Promise<Star[]> {
  const first = await fetch(`${API}/repos/${repo}/stargazers?per_page=100&page=1`, { headers: headers() });
  if (!first.ok) throw new Error(`GET stargazers ${repo} -> ${first.status}`);
  const link = first.headers.get("link") ?? "";
  const last = Number(/page=(\d+)>; rel="last"/.exec(link)?.[1] ?? 1);
  const fresh: Star[] = [];
  for (let page = last; page >= 1 && fresh.length < limit; page--) {
    const stars: Star[] = page === 1 ? await first.json() : await fetchJson(`${API}/repos/${repo}/stargazers?per_page=100&page=${page}`, { headers: headers() });
    const batch = stars.filter((s) => !since || s.starred_at > since).reverse();
    fresh.push(...batch);
    if (batch.length < stars.length) break;
  }
  return fresh.slice(0, limit);
}

export async function pull(ctx: PullContext): Promise<Signal[]> {
  const repos = Array.isArray(ctx.settings.repos) ? (ctx.settings.repos as string[]) : [];
  if (!repos.length) throw new Error("settings.github-stargazers.repos is empty");
  const maxPerRun = Number(ctx.settings.max_per_run ?? 20);
  const firstRunLimit = Number(ctx.settings.first_run_limit ?? 5);
  const watermarks = (ctx.state.since ??= {}) as Record<string, string>;
  const signals: Signal[] = [];

  for (const repo of repos) {
    const since = watermarks[repo];
    const stars = await newStars(repo, since, since ? maxPerRun : firstRunLimit);
    for (const s of stars) {
      const u = await fetchJson<User>(`${API}/users/${s.user.login}`, { headers: headers() });
      signals.push(
        makeSignal(
          "github-stargazers",
          "github-stargazers.star.new",
          { name: str(u.name) ?? u.login, company: str(u.company)?.replace(/^@/, ""), email: str(u.email), url: u.html_url, domain: hostOf(str(u.blog)) },
          { repo, login: u.login, bio: str(u.bio), location: str(u.location), starredAt: s.starred_at },
          s.starred_at,
        ),
      );
    }
    const newest = stars[0]?.starred_at;
    if (newest && (!since || newest > since)) watermarks[repo] = newest;
  }
  return signals;
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    return /\./.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

const integration: Integration = { pull };
export default integration;
