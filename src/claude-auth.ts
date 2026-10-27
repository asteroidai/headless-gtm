import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, env } from "./env.ts";
import { claudeEnv } from "./runner.ts";

/** Headless runs use a long-lived token from `claude setup-token`. Browser logins expire. */
export function authStatus(): { mode: "oauth-token" | "api-key" | "cli-login"; ok: boolean; detail: string } {
  const mode = env("CLAUDE_CODE_OAUTH_TOKEN") ? "oauth-token" : env("ANTHROPIC_API_KEY") ? "api-key" : "cli-login";
  const probe = spawnSync(env("CLAUDE_BIN") ?? "claude", ["-p", "Reply with the single word ok.", "--max-turns", "1"], {
    env: claudeEnv(),
    encoding: "utf8",
    timeout: 60_000,
  });
  const ok = probe.status === 0;
  return { mode, ok, detail: ok ? "claude answered" : (probe.stderr || probe.stdout || "no output").trim().slice(0, 200) };
}

/** Replace the token in `.env` and in this process. Running jobs pick it up on their next spawn. */
export function rotateToken(token: string): void {
  if (!/^sk-ant-oat01-[A-Za-z0-9_-]+$/.test(token)) throw new Error("expected a token from `claude setup-token`");
  const path = resolve(ROOT, ".env");
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `CLAUDE_CODE_OAUTH_TOKEN=${token}`;
  const next = /^CLAUDE_CODE_OAUTH_TOKEN=.*$/m.test(current)
    ? current.replace(/^CLAUDE_CODE_OAUTH_TOKEN=.*$/m, line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(path, next);
  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
}
