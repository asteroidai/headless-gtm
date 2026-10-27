import { env } from "../../src/env.ts";
import { obj, str } from "../../src/http.ts";
import { domainOf, makeSignal } from "../../src/signals.ts";
import type { Integration, Signal } from "../../src/types.ts";

/** RB2B sends Title-Case keys with spaces. Accept snake_case too. */
export function parse(body: unknown): Signal[] {
  const b = obj(body);
  const pick = (...keys: string[]) => keys.map((k) => str(b[k])).find(Boolean);
  const email = pick("Business Email", "business_email", "email")?.toLowerCase();
  const website = pick("Website", "website");
  const company = pick("Company Name", "company_name", "company");
  const name = [pick("First Name", "first_name"), pick("Last Name", "last_name")].filter(Boolean).join(" ") || pick("Name", "name");
  const domain = website ? hostOf(website) : domainOf(email);
  if (!email && !domain) return [];
  return [
    makeSignal(
      "rb2b",
      "rb2b.visitor.identified",
      { email, name, company, domain, url: pick("LinkedIn URL", "linkedin_url") },
      {
        title: pick("Title", "title"),
        page: pick("Captured URL", "captured_url"),
        referrer: pick("Referrer", "referrer"),
        repeatVisitor: b.is_repeat_visitor === true,
      },
      pick("Timestamp", "timestamp"),
    ),
  ];
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const integration: Integration = {
  handle(req) {
    const token = req.query.token ?? req.headers["x-webhook-token"];
    const expected = env("RB2B_TOKEN");
    if (!expected || token !== expected) return null;
    return parse(req.body);
  },
  sign() {
    return { query: { token: env("RB2B_TOKEN") ?? "" } };
  },
};

export default integration;
