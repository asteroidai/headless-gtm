import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DATA_DIR } from "./env.ts";
import { appendJsonl, readJsonl } from "./persist.ts";
import type { Signal, Subject } from "./types.ts";

const FILE = resolve(DATA_DIR, "signals.jsonl");

export function makeSignal(
  source: string,
  event: string,
  subject: Subject,
  payload: Record<string, unknown> = {},
  occurredAt?: string,
): Signal {
  if (!event.startsWith(`${source}.`)) throw new Error(`event "${event}" must start with "${source}."`);
  const now = new Date().toISOString();
  return { id: randomUUID(), source, event, occurredAt: occurredAt ?? now, receivedAt: now, subject: compact(subject), payload };
}

export function recordSignal(signal: Signal): void {
  appendJsonl(FILE, signal);
}

export function recentSignals(sinceMs: number): Signal[] {
  const cutoff = Date.now() - sinceMs;
  return readJsonl<Signal>(FILE).filter((s) => Date.parse(s.receivedAt) >= cutoff);
}

/** The skill the config routes this event to, or null when nothing listens. */
export function routeFor(on: Record<string, string>, event: string): string | null {
  return on[event] ?? null;
}

export function domainOf(email?: string): string | undefined {
  const d = email?.split("@")[1]?.toLowerCase();
  if (!d) return undefined;
  return FREE_MAIL.has(d) ? undefined : d;
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "protonmail.com", "live.com", "me.com", "aol.com"]);

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;
}
