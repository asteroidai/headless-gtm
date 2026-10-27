import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./env.ts";
import type { Integration, LoadedIntegration, Manifest } from "./types.ts";

export const INTEGRATIONS_DIR = resolve(ROOT, "integrations");

const loaded = new Map<string, LoadedIntegration>();
const disabled = new Map<string, string[]>();

export function readManifest(name: string): Manifest {
  const path = resolve(INTEGRATIONS_DIR, name, "manifest.json");
  if (!existsSync(path)) throw new Error(`no integration named "${name}" (missing ${path})`);
  const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  if (m.name !== name) throw new Error(`manifest in ${name}/ is named "${m.name}"`);
  return m;
}

export function listAvailable(): Manifest[] {
  return readdirSync(INTEGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(INTEGRATIONS_DIR, d.name, "manifest.json")))
    .map((d) => readManifest(d.name));
}

/** Import `integrations/<name>/index.ts` for each enabled name. One with missing required env is skipped and listed as disabled. */
export async function loadIntegrations(names: string[]): Promise<LoadedIntegration[]> {
  loaded.clear();
  disabled.clear();
  for (const name of names) {
    const manifest = readManifest(name);
    const missing = missingEnv(manifest);
    if (missing.length) {
      disabled.set(name, missing);
      console.warn(`${name}: disabled, missing ${missing.join(", ")}`);
      continue;
    }
    const mod = (await import(resolve(INTEGRATIONS_DIR, name, "index.ts"))) as { default: Integration };
    loaded.set(name, { manifest, ...mod.default });
  }
  return [...loaded.values()];
}

export function getIntegration(name: string): LoadedIntegration | undefined {
  return loaded.get(name);
}

export function enabledIntegrations(): LoadedIntegration[] {
  return [...loaded.values()];
}

/** Configured integrations that did not load because env is missing. */
export function disabledIntegrations(): Array<{ name: string; missing: string[] }> {
  return [...disabled].map(([name, missing]) => ({ name, missing }));
}

/** Why `getIntegration(name)` returned nothing, in a sentence for a log or an error. */
export function notEnabledReason(name: string): string {
  const missing = disabled.get(name);
  return missing ? `"${name}" is disabled: missing ${missing.join(", ")}` : `"${name}" is not enabled`;
}

/** Env vars a manifest marks required that are not set. */
export function missingEnv(m: Manifest): string[] {
  return m.env.filter((e) => e.required !== false && !process.env[e.name]?.trim()).map((e) => e.name);
}
