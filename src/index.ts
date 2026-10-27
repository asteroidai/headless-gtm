import { serve } from "@hono/node-server";
import { execSync } from "node:child_process";
import { loadConfig } from "./config.ts";
import { loadEnv } from "./env.ts";
import { loadIntegrations } from "./integrations.ts";
import { recoverJobs } from "./jobs.ts";
import { startCron } from "./cron.ts";
import { runSchedule } from "./pulls.ts";
import { configureQueue } from "./queue.ts";
import { killAll } from "./runner.ts";
import { createApp } from "./server.ts";
import { configureWrites, runAction } from "./writes.ts";

loadEnv();
const cfg = loadConfig();
configureQueue(cfg);
configureWrites(cfg.settings);

const integrations = await loadIntegrations(cfg.integrations);
if (!process.env.ADMIN_TOKEN) console.warn("ADMIN_TOKEN is empty: the dashboard and admin routes are open to anyone who reaches the port. Set it before you open a tunnel.");

const interrupted = recoverJobs();
if (interrupted) console.log(`marked ${interrupted} interrupted job(s) failed`);

startCron(cfg.schedules, (name) => {
  runSchedule(cfg, name).catch((err) => console.error(`[schedule ${name}] ${err instanceof Error ? err.message : err}`));
});

serve({ fetch: createApp(cfg).fetch, port: cfg.port }, () => {
  console.log(`headless-gtm on http://localhost:${cfg.port} (${integrations.length} integrations, ${cfg.schedules.length} schedules)`);
  void bootMessage();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    killAll();
    process.exit(0);
  });
}

/** Tell the team the server is up and which commit it runs. Slack only when enabled. */
async function bootMessage(): Promise<void> {
  if (!cfg.integrations.includes("slack") || !process.env.SLACK_BOT_TOKEN) return;
  let sha = "unknown";
  try {
    sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // not a git checkout
  }
  await runAction("slack", "post", { text: `headless-gtm booted at ${sha} with ${integrations.length} integrations` }).catch((err) =>
    console.warn(`boot message failed: ${err instanceof Error ? err.message : err}`),
  );
}
