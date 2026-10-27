import { resolve } from "node:path";
import type { Config } from "./config.ts";
import { DATA_DIR } from "./env.ts";
import { getIntegration } from "./integrations.ts";
import { readJson, writeJson } from "./persist.ts";
import { enqueue } from "./queue.ts";
import { recordSignal, routeFor } from "./signals.ts";
import type { Signal } from "./types.ts";

function statePath(name: string): string {
  return resolve(DATA_DIR, "state", `${name}.json`);
}

/** Run one pull: fetch new items, record them as signals, route each to a skill. */
export async function runPull(cfg: Config, name: string): Promise<{ signals: Signal[]; jobs: number }> {
  const integration = getIntegration(name);
  if (!integration?.pull) throw new Error(`"${name}" is not an enabled pull integration`);
  const state = readJson<Record<string, unknown>>(statePath(name), {});
  const signals = await integration.pull({ settings: cfg.settings[name] ?? {}, state });
  writeJson(statePath(name), state);
  const jobs = dispatch(cfg, signals);
  console.log(`[pull ${name}] ${signals.length} signal(s), ${jobs} job(s)`);
  return { signals, jobs };
}

/** Record signals and queue a job for every one the config routes. */
export function dispatch(cfg: Config, signals: Signal[]): number {
  let jobs = 0;
  for (const s of signals) {
    recordSignal(s);
    const skill = routeFor(cfg.on, s.event);
    if (!skill) continue;
    enqueue(skill, { event: s.event, subject: s.subject, ...s.payload }, s);
    jobs++;
  }
  return jobs;
}

/** Run a schedule by name: a pull, a skill, or both. */
export async function runSchedule(cfg: Config, name: string): Promise<void> {
  const s = cfg.schedules.find((x) => x.name === name);
  if (!s) throw new Error(`no schedule "${name}"`);
  if (s.pull) await runPull(cfg, s.pull);
  if (s.skill) enqueue(s.skill, { schedule: s.name, ...(s.input ?? {}) });
}
