import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { isCollection, parseDocument, type Document } from "yaml";
import { CONFIG_PATH, loadConfig } from "./config.ts";
import { ROOT, env, loadEnv } from "./env.ts";
import { INTEGRATIONS_DIR, listAvailable, loadIntegrations, missingEnv, notEnabledReason, readManifest } from "./integrations.ts";
import { configureWrites, runAction } from "./writes.ts";

const USAGE = `usage:
  gtm doctor                               check node, claude, .env, the config and its env vars
  gtm list                                 integrations: on, off, or disabled for missing env
  gtm add <integration>                    enable one in gtm.config.yaml, print its env vars
  gtm tool <integration> <action> [json]   call an action (skills use this for reads)
  gtm run <skill> [json]                   queue a skill run on the local server
  gtm pull <integration>                   run a pull now on the local server
  gtm webhook <source> [fixture]           replay a recorded fixture at the local server
  gtm jobs [n]                             the last n jobs on the local server (default 20)`;

loadEnv();
const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case "doctor":
      process.exit(await doctor());
    case "list":
      list();
      break;
    case "add":
      add(need(args[0], "integration"));
      break;
    case "tool":
      await tool(need(args[0], "integration"), need(args[1], "action"), args[2]);
      break;
    case "run":
      await post("/jobs/run", { skill: need(args[0], "skill"), input: args[1] ? JSON.parse(args[1]) : {} });
      break;
    case "pull":
      await post(`/pulls/${need(args[0], "integration")}/run`);
      break;
    case "webhook":
      await webhook(need(args[0], "source"), args[1]);
      break;
    case "jobs":
      await jobs(Number(args[0] ?? 20));
      break;
    default:
      console.log(USAGE);
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function need(v: string | undefined, what: string): string {
  if (!v) throw new Error(`missing <${what}>\n${USAGE}`);
  return v;
}

function list(): void {
  const enabled = new Set(loadConfig().integrations);
  for (const m of listAvailable()) {
    const missing = enabled.has(m.name) ? missingEnv(m) : [];
    const mark = !enabled.has(m.name) ? "off" : missing.length ? "!! " : "on ";
    const what = missing.length ? `disabled: missing ${missing.join(", ")}` : m.description;
    console.log(`${mark}  ${m.name.padEnd(22)} ${m.kind.padEnd(7)} ${what}`);
  }
}

function add(name: string): void {
  const m = readManifest(name);
  const doc: Document = existsSync(CONFIG_PATH) ? parseDocument(readFileSync(CONFIG_PATH, "utf8")) : parseDocument("{}");
  ensureCollection(doc, "integrations", []);
  const integrations = (doc.get("integrations") as { items?: unknown[] } | undefined)?.items ?? [];
  const already = integrations.some((n) => String(n) === name || (n as { value?: string })?.value === name);
  if (!already) doc.addIn(["integrations"], name);

  if (m.defaults?.on) ensureCollection(doc, "on", {});
  for (const [event, skill] of Object.entries(m.defaults?.on ?? {})) {
    if (!doc.hasIn(["on", event])) doc.setIn(["on", event], skill);
  }
  if (m.defaults?.settings) ensureCollection(doc, "settings", {});
  for (const [k, v] of Object.entries(m.defaults?.settings ?? {})) {
    if (!doc.hasIn(["settings", name, k])) doc.setIn(["settings", name, k], v);
  }
  if (m.kind === "pull" && m.schedule) {
    ensureCollection(doc, "schedules", []);
    const schedules = (doc.get("schedules") as { items?: Array<{ get: (k: string) => unknown }> } | undefined)?.items ?? [];
    if (!schedules.some((s) => s.get?.("pull") === name)) doc.addIn(["schedules"], { name, cron: m.schedule, pull: name });
  }
  blockStyle(doc);
  writeFileSync(CONFIG_PATH, doc.toString());

  console.log(`${already ? "already enabled" : "enabled"}: ${name} (${m.kind})`);
  if (m.env.length) {
    console.log("env vars (.env):");
    for (const e of m.env) console.log(`  ${e.name}${e.required === false ? " (optional)" : ""}${e.about ? ` - ${e.about}` : ""}`);
  }
  const missing = missingEnv(m);
  if (missing.length) console.log(`not set yet: ${missing.join(", ")}`);
  for (const skill of m.skills ?? []) {
    const ok = existsSync(resolve(ROOT, ".claude/skills", skill, "SKILL.md"));
    console.log(`skill /${skill}: ${ok ? "found" : "MISSING in .claude/skills/"}`);
  }
  if (m.events?.length) console.log(`events: ${m.events.join(", ")}`);
  console.log("restart the server to load it");
}

/** `addIn` and `setIn` need a collection under the key. A missing key or a bare `key:` gives a scalar and corrupts the file. */
function ensureCollection(doc: Document, key: string, empty: unknown[] | Record<string, never>): void {
  if (!isCollection(doc.get(key, true))) doc.setIn([key], doc.createNode(empty));
}

/** An empty `[]` or `{}` in the file stays flow-style once filled. Block style reads better. */
function blockStyle(doc: Document): void {
  const block = (node: unknown) => {
    if (isCollection(node) && node.items.length) node.flow = false;
  };
  block(doc.contents);
  for (const key of ["integrations", "on", "schedules", "settings"]) {
    const node = doc.get(key, true);
    if (!isCollection(node)) continue;
    block(node);
    for (const item of node.items) block((item as { value?: unknown }).value ?? item);
  }
}

async function tool(integration: string, action: string, json?: string): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.integrations.includes(integration)) throw new Error(`"${integration}" is not enabled. Run: pnpm gtm add ${integration}`);
  configureWrites(cfg.settings);
  await loadIntegrations([integration]);
  const out = await runAction(integration, action, json ? JSON.parse(json) : {});
  console.log(JSON.stringify(out, null, 2));
}

async function webhook(source: string, fixture?: string): Promise<void> {
  const dir = resolve(INTEGRATIONS_DIR, source, "fixtures");
  const file = fixture ? `${fixture}.json` : readdirSync(dir).find((f) => f.endsWith(".json"));
  if (!file) throw new Error(`no fixtures in ${dir}`);
  const rawBody = readFileSync(resolve(dir, file), "utf8");
  const [i] = await loadIntegrations([source]);
  if (!i) throw new Error(`${notEnabledReason(source)}. Set it in .env first.`);
  const signed = i.sign?.(rawBody) ?? {};
  const qs = new URLSearchParams(signed.query ?? {}).toString();
  const r = await request("POST", `/webhooks/${source}${qs ? `?${qs}` : ""}`, rawBody, signed.headers);
  console.log(`${r.status} ${r.text}`);
}

async function jobs(limit: number): Promise<void> {
  const r = await request("GET", `/jobs?limit=${limit}`, undefined, adminHeaders());
  if (r.status !== 200) throw new Error(`${r.status} ${r.text}`);
  const list = (JSON.parse(r.text) as { jobs: Array<{ id: string; skill: string; status: string; createdAt: string; summary?: string; error?: string }> }).jobs;
  if (!list.length) console.log("no jobs yet");
  for (const j of list) {
    const line = (j.summary ?? j.error ?? "").split("\n")[0]!.slice(0, 100);
    console.log(`${j.createdAt.slice(0, 16).replace("T", " ")}  ${j.status.padEnd(7)} ${j.id.slice(0, 8)}  /${j.skill}  ${line}`);
  }
}

function adminHeaders(): Record<string, string> {
  const token = env("ADMIN_TOKEN");
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function post(path: string, body?: unknown): Promise<void> {
  const r = await request("POST", path, body === undefined ? undefined : JSON.stringify(body), adminHeaders());
  console.log(`${r.status} ${r.text}`);
}

async function request(method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const base = env("GTM_URL") ?? `http://localhost:${loadConfig().port}`;
  const res = await fetch(base + path, { method, body, headers: { "content-type": "application/json", ...headers } }).catch(() => {
    throw new Error(`server not reachable at ${base}. Start it with: pnpm dev`);
  });
  return { status: res.status, text: await res.text() };
}

/** The checks a first run trips over. Returns the exit code. */
async function doctor(): Promise<number> {
  let problems = 0;
  const ok = (s: string) => console.log(`ok  ${s}`);
  const bad = (s: string) => {
    problems++;
    console.log(`!!  ${s}`);
  };
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major > 20 || (major === 20 && minor >= 12)) ok(`node ${process.versions.node}`);
  else bad(`node ${process.versions.node}; need 20.12 or newer`);
  if (existsSync(resolve(ROOT, ".env"))) ok(".env present");
  else bad(".env missing. Run: cp .env.example .env");
  const bin = env("CLAUDE_BIN") ?? "claude";
  try {
    const { stdout } = await promisify(execFile)(bin, ["--version"], { timeout: 15_000, encoding: "utf8" });
    ok(`claude ${stdout.trim().split("\n")[0]}`);
  } catch {
    bad(`claude not found as "${bin}". Install Claude Code, or set CLAUDE_BIN in .env`);
  }
  ok(`claude auth: ${env("CLAUDE_CODE_OAUTH_TOKEN") ? "subscription token" : env("ANTHROPIC_API_KEY") ? "API key" : "the CLI's own login (fine on a laptop; it expires on a server)"}`);
  let cfg;
  try {
    cfg = loadConfig();
    ok(`gtm.config.yaml: ${cfg.integrations.length} integration(s), ${cfg.schedules.length} schedule(s)`);
  } catch (err) {
    bad(`gtm.config.yaml: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
  for (const name of cfg.integrations) {
    const m = readManifest(name);
    const missing = missingEnv(m);
    if (missing.length) bad(`${name}: set ${missing.join(", ")} in .env`);
    else ok(name);
    for (const skill of m.skills ?? []) {
      if (!existsSync(resolve(ROOT, ".claude/skills", skill, "SKILL.md"))) bad(`${name} expects /${skill}, which is not in .claude/skills/`);
    }
  }
  if (env("ADMIN_TOKEN")) ok("ADMIN_TOKEN set");
  else console.log("--  ADMIN_TOKEN empty: fine on a laptop, set it before you open a tunnel");
  console.log(problems ? `${problems} problem(s)` : "all good");
  return problems ? 1 : 0;
}
