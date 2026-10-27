import { randomUUID } from "node:crypto";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "./env.ts";
import { readJson, writeJson } from "./persist.ts";
import type { Draft } from "./types.ts";

const DIR = resolve(DATA_DIR, "drafts");

/** Drafts wait here for a human. Nothing in this repo sends one. */
export function saveDraft(jobId: string, d: Omit<Draft, "id" | "jobId" | "createdAt">): Draft {
  const draft: Draft = { id: randomUUID(), jobId, createdAt: new Date().toISOString(), ...d };
  writeJson(resolve(DIR, `${draft.id}.json`), draft);
  return draft;
}

export function getDraft(id: string): Draft | undefined {
  return readJson<Draft | undefined>(resolve(DIR, `${id}.json`), undefined);
}

export function listDrafts(): Draft[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Draft | undefined>(resolve(DIR, f), undefined))
    .filter((d): d is Draft => !!d)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
