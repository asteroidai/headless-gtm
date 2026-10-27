import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { ROOT } from "./env.ts";

export interface Schedule {
  name: string;
  cron: string;
  pull?: string;
  skill?: string;
  input?: Record<string, unknown>;
}

export interface Config {
  port: number;
  claude: { concurrency: number; timeoutMinutes: number; maxTurns: number };
  integrations: string[];
  on: Record<string, string>;
  schedules: Schedule[];
  settings: Record<string, Record<string, unknown>>;
}

export const CONFIG_PATH = resolve(ROOT, "gtm.config.yaml");

const DEFAULTS: Config = {
  port: 5005,
  claude: { concurrency: 2, timeoutMinutes: 10, maxTurns: 60 },
  integrations: [],
  on: {},
  schedules: [],
  settings: {},
};

export function parseConfig(text: string): Config {
  const raw = (parse(text) ?? {}) as Record<string, unknown>;
  const claude = asObject(raw.claude, "claude");
  const cfg: Config = {
    port: Number(raw.port ?? DEFAULTS.port),
    claude: {
      concurrency: Number(claude.concurrency ?? DEFAULTS.claude.concurrency),
      timeoutMinutes: Number(claude.timeout_minutes ?? DEFAULTS.claude.timeoutMinutes),
      maxTurns: Number(claude.max_turns ?? DEFAULTS.claude.maxTurns),
    },
    integrations: asStringList(raw.integrations, "integrations"),
    on: asStringMap(raw.on, "on"),
    schedules: asSchedules(raw.schedules),
    settings: asObject(raw.settings, "settings") as Config["settings"],
  };
  validate(cfg);
  return cfg;
}

export function loadConfig(path = CONFIG_PATH): Config {
  if (!existsSync(path)) return { ...DEFAULTS };
  return parseConfig(readFileSync(path, "utf8"));
}

function validate(cfg: Config): void {
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) throw new Error("port must be a positive integer");
  for (const [k, v] of Object.entries(cfg.claude)) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`claude.${k} must be a positive number`);
  }
  const names = new Set(cfg.integrations);
  for (const event of Object.keys(cfg.on)) {
    const source = event.split(".")[0] ?? "";
    if (!names.has(source)) throw new Error(`on: "${event}" names integration "${source}", which is not enabled`);
  }
  for (const s of cfg.schedules) {
    if (!s.pull && !s.skill) throw new Error(`schedule "${s.name}" needs a pull or a skill`);
    if (s.pull && !names.has(s.pull)) throw new Error(`schedule "${s.name}" pulls "${s.pull}", which is not enabled`);
    if (s.cron.trim().split(/\s+/).length !== 5) throw new Error(`schedule "${s.name}" has a bad cron "${s.cron}"`);
  }
}

function asObject(v: unknown, key: string): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${key} must be a map`);
  return v as Record<string, unknown>;
}

function asStringList(v: unknown, key: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`${key} must be a list of strings`);
  return v as string[];
}

function asStringMap(v: unknown, key: string): Record<string, string> {
  const o = asObject(v, key);
  for (const [k, val] of Object.entries(o)) {
    if (typeof val !== "string") throw new Error(`${key}.${k} must be a skill name`);
  }
  return o as Record<string, string>;
}

function asSchedules(v: unknown): Schedule[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("schedules must be a list");
  return v.map((s, i) => {
    const o = asObject(s, `schedules[${i}]`);
    if (typeof o.name !== "string" || typeof o.cron !== "string") throw new Error(`schedules[${i}] needs name and cron`);
    return {
      name: o.name,
      cron: o.cron,
      pull: typeof o.pull === "string" ? o.pull : undefined,
      skill: typeof o.skill === "string" ? o.skill : undefined,
      input: o.input ? asObject(o.input, `schedules[${i}].input`) : undefined,
    };
  });
}
