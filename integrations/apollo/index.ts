import { requireEnv } from "../../src/env.ts";
import { fetchJson, obj, str } from "../../src/http.ts";
import type { Integration } from "../../src/types.ts";

const API = "https://api.apollo.io/api/v1";

function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": requireEnv("APOLLO_API_KEY"), "cache-control": "no-cache" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function compactOrg(o: Record<string, unknown>) {
  return {
    name: str(o.name),
    domain: str(o.primary_domain),
    website: str(o.website_url),
    linkedin: str(o.linkedin_url),
    industry: str(o.industry),
    employees: Number(o.estimated_num_employees) || undefined,
    founded: o.founded_year ?? undefined,
    revenue: str(o.annual_revenue_printed),
    funding: str(o.total_funding_printed),
    lastFunding: str(o.latest_funding_stage),
    location: [str(o.city), str(o.state), str(o.country)].filter(Boolean).join(", ") || undefined,
    description: str(o.short_description)?.slice(0, 600),
    keywords: Array.isArray(o.keywords) ? (o.keywords as string[]).slice(0, 15) : undefined,
  };
}

export function compactPerson(p: Record<string, unknown>) {
  return {
    name: str(p.name),
    title: str(p.title),
    email: str(p.email),
    emailStatus: str(p.email_status),
    linkedin: str(p.linkedin_url),
    seniority: str(p.seniority),
    location: [str(p.city), str(p.state), str(p.country)].filter(Boolean).join(", ") || undefined,
    company: str(obj(p.organization).name),
  };
}

const integration: Integration = {
  actions: {
    /** { domain } */
    async "enrich-company"(input) {
      const res = await call<{ organization?: Record<string, unknown> }>("GET", `/organizations/enrich?domain=${encodeURIComponent(String(input.domain))}`);
      return res.organization ? compactOrg(res.organization) : null;
    },
    /** { email } or { first_name, last_name, domain }. Never reveals personal emails. */
    async "enrich-person"(input) {
      const res = await call<{ person?: Record<string, unknown> }>("POST", "/people/match", {
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        domain: input.domain,
        reveal_personal_emails: false,
      });
      return res.person ? compactPerson(res.person) : null;
    },
    /** { domain, titles?: string[], seniorities?: string[], limit? } */
    async "find-people"(input) {
      const res = await call<{ people?: Array<Record<string, unknown>> }>("POST", "/mixed_people/search", {
        q_organization_domains_list: [input.domain],
        person_titles: input.titles,
        person_seniorities: input.seniorities,
        per_page: Number(input.limit ?? 10),
        page: 1,
      });
      return (res.people ?? []).map(compactPerson);
    },
  },
};

export default integration;
