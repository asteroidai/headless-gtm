import { saveDraft } from "./drafts.ts";
import { getIntegration } from "./integrations.ts";
import type { Completion, Settings, WriteRequest, WriteResult } from "./types.ts";

let settings: Record<string, Settings> = {};

export function configureWrites(s: Record<string, Settings>): void {
  settings = s;
}

/** Run one action of an enabled integration. */
export async function runAction(integration: string, action: string, input: Record<string, unknown>): Promise<unknown> {
  const i = getIntegration(integration);
  if (!i) throw new Error(`integration "${integration}" is not enabled`);
  const fn = i.actions?.[action];
  if (!fn) throw new Error(`"${integration}" has no action "${action}"`);
  return fn(input, settings[integration] ?? {});
}

/** Writes from a completion. Only `write` integrations may be called this way. */
export async function applyWrites(writes: WriteRequest[]): Promise<WriteResult[]> {
  const results: WriteResult[] = [];
  for (const w of writes) {
    const kind = getIntegration(w.integration)?.manifest.kind;
    try {
      if (kind !== "write") throw new Error(`"${w.integration}" is not an enabled write integration`);
      results.push({ ...w, ok: true, result: await runAction(w.integration, w.action, w.input ?? {}) });
    } catch (err) {
      results.push({ ...w, ok: false, error: err instanceof Error ? err.message : String(err) });
      console.warn(`[write ${w.integration}.${w.action}] failed: ${results.at(-1)!.error}`);
    }
  }
  return results;
}

export async function applyCompletion(jobId: string, body: Completion): Promise<{ writes: WriteResult[]; draftIds: string[] }> {
  const writes = await applyWrites(body.writes ?? []);
  const draftIds = (body.drafts ?? []).map((d) => saveDraft(jobId, d).id);
  return { writes, draftIds };
}

export function parseCompletion(body: unknown): Completion {
  if (!body || typeof body !== "object") throw new Error("body must be a JSON object");
  const b = body as Record<string, unknown>;
  if (typeof b.summary !== "string" || !b.summary.trim()) throw new Error("summary is required");
  if (b.writes !== undefined && !Array.isArray(b.writes)) throw new Error("writes must be a list");
  if (b.drafts !== undefined && !Array.isArray(b.drafts)) throw new Error("drafts must be a list");
  for (const w of (b.writes ?? []) as unknown[]) {
    const o = w as Record<string, unknown>;
    if (typeof o?.integration !== "string" || typeof o?.action !== "string") throw new Error("each write needs integration and action");
  }
  for (const d of (b.drafts ?? []) as unknown[]) {
    const o = d as Record<string, unknown>;
    if (!["email", "message", "note"].includes(String(o?.kind)) || typeof o?.body !== "string") {
      throw new Error("each draft needs kind (email|message|note) and body");
    }
  }
  return b as unknown as Completion;
}
