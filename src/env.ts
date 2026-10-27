import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");
export const DATA_DIR = resolve(ROOT, process.env.GTM_DATA_DIR ?? "data");

/** Load `.env` once. Values already in the environment win. */
export function loadEnv(): void {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  const before = { ...process.env };
  process.loadEnvFile(path);
  for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
}

export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
