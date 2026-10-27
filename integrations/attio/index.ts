import { requireEnv } from "../../src/env.ts";
import { fetchJson, obj, str } from "../../src/http.ts";
import type { Integration } from "../../src/types.ts";

const API = "https://api.attio.com/v2";

function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${requireEnv("ATTIO_API_KEY")}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface Record_ {
  id: { record_id: string };
  values: Record<string, unknown>;
  web_url?: string;
}

function compact(r: Record_) {
  const first = (slug: string) => {
    const v = r.values[slug];
    const item = obj(Array.isArray(v) ? v[0] : v);
    return str(item.value) ?? str(item.domain) ?? str(item.email_address) ?? str(item.full_name);
  };
  return { id: r.id.record_id, url: r.web_url, name: first("name"), domain: first("domains"), email: first("email_addresses"), title: first("job_title") };
}

async function query(object: "companies" | "people", filter: unknown) {
  const res = await call<{ data: Record_[] }>("POST", `/objects/${object}/records/query`, { filter, limit: 5 });
  return res.data.map(compact);
}

export function splitName(name?: string) {
  if (!name) return undefined;
  const parts = name.trim().split(/\s+/);
  return [{ first_name: parts[0] ?? "", last_name: parts.slice(1).join(" "), full_name: name.trim() }];
}

const integration: Integration = {
  actions: {
    /** { domain } */
    async "find-company"(input) {
      return query("companies", { domains: { domain: { $eq: String(input.domain) } } });
    },
    /** { email } */
    async "find-person"(input) {
      return query("people", { email_addresses: { email_address: { $eq: String(input.email) } } });
    },
    /** { domain, name?, description? }. Matches on domain, so a repeat is an update. */
    async "upsert-company"(input) {
      const values: Record<string, unknown> = { domains: [{ domain: String(input.domain) }] };
      if (input.name) values.name = input.name;
      if (input.description) values.description = input.description;
      const res = await call<{ data: Record_ }>("PUT", "/objects/companies/records?matching_attribute=domains", { data: { values } });
      return compact(res.data);
    },
    /** { email, name?, title?, company_domain? }. Matches on email. */
    async "upsert-person"(input) {
      const values: Record<string, unknown> = { email_addresses: [{ email_address: String(input.email) }] };
      const name = splitName(str(input.name));
      if (name) values.name = name;
      if (input.title) values.job_title = input.title;
      if (input.company_domain) values.company = [{ target_object: "companies", domains: [{ domain: String(input.company_domain) }] }];
      const res = await call<{ data: Record_ }>("PUT", "/objects/people/records?matching_attribute=email_addresses", { data: { values } });
      return compact(res.data);
    },
    /** { object: "companies" | "people", record_id, title, content } (markdown) */
    async "add-note"(input) {
      const res = await call<{ data: { id: { note_id: string } } }>("POST", "/notes", {
        data: {
          parent_object: String(input.object),
          parent_record_id: String(input.record_id),
          title: String(input.title ?? "Note"),
          format: "markdown",
          content: String(input.content ?? ""),
        },
      });
      return { noteId: res.data.id.note_id };
    },
  },
};

export default integration;
