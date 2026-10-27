import { timingSafeEqual } from "node:crypto";
import { env } from "../../src/env.ts";
import { obj, str } from "../../src/http.ts";
import { domainOf, makeSignal } from "../../src/signals.ts";
import type { Integration, Signal } from "../../src/types.ts";

export function verify(secret: string | undefined, expected = env("SIGNUP_SECRET")): boolean {
  if (!secret || !expected || secret.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

/** Body: { email, name?, company?, plan?, ...anything else }. Extra fields ride in the payload. */
export function parse(body: unknown): Signal[] {
  const b = obj(body);
  const email = str(b.email)?.toLowerCase();
  if (!email?.includes("@")) return [];
  const { email: _e, name, company, ...rest } = b;
  return [
    makeSignal("signup", "signup.created", { email, name: str(name), company: str(company), domain: domainOf(email) }, rest, str(b.created_at)),
  ];
}

const integration: Integration = {
  handle(req) {
    const header = req.headers["x-signup-secret"] ?? req.headers.authorization?.replace(/^Bearer /, "");
    if (!verify(header)) return null;
    return parse(req.body);
  },
  sign() {
    return { headers: { "x-signup-secret": env("SIGNUP_SECRET") ?? "" } };
  },
};

export default integration;
