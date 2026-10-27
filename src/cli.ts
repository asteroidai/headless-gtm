import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCollection, parseDocument, type Document } from "yaml";
import { CONFIG_PATH, loadConfig } from "./config.ts";
import { ROOT, env, loadEnv } from "./env.ts";
import { INTEGRATIONS_DIR, listAvailable, loadIntegrations, missingEnv, readManifest } from "./integrations.ts";
import { configureWrites, runAction } from "./writes.ts";

const USAGE = `usage:
  gtm list                                 integrations and whether they are enabled
  gtm add <integration>                    enable one in gtm.config.yaml, print its env vars
  gtm tool <integration> <action> [json]   call an action (skills use this for reads)
  gtm run <skill> [json]                   queue a skill run on the local server
  gtm pull <integration>                   run a pull now on the local server
  gtm webhook <source> [fixture]           replay a recorded fixture at the local server`;

loadEnv();
const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
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
    const mark = enabled.has(m.name) ? "on " : "off";
    console.log(`${mark}  ${m.name.padEnd(22)} ${m.kind.padEnd(7)} ${m.description}`);
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
  if (isCollection(doc.contents)) doc.contents.flow = false;
  for (const key of ["integrations", "on", "schedules", "settings"]) {
    const node = doc.get(key, true);
    if (!isCollection(node)) continue;
    node.flow = false;
    for (const item of node.items) {
      const value = (item as { value?: unknown }).value ?? item;
      if (isCollection(value)) value.flow = false;
    }
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
  const signed = i?.sign?.(rawBody) ?? {};
  const qs = new URLSearchParams(signed.query ?? {}).toString();
  await request(`/webhooks/${source}${qs ? `?${qs}` : ""}`, rawBody, signed.headers);
}

async function post(path: string, body?: unknown): Promise<void> {
  const headers: Record<string, string> = {};
  if (env("ADMIN_TOKEN")) headers.authorization = `Bearer ${env("ADMIN_TOKEN")}`;
  await request(path, body === undefined ? undefined : JSON.stringify(body), headers);
}

async function request(path: string, body?: string, headers: Record<string, string> = {}): Promise<void> {
  const base = env("GTM_URL") ?? `http://localhost:${loadConfig().port}`;
  const res = await fetch(base + path, { method: "POST", body, headers: { "content-type": "application/json", ...headers } }).catch(() => {
    throw new Error(`server not reachable at ${base}. Start it with: pnpm dev`);
  });
  console.log(`${res.status} ${await res.text()}`);
}
