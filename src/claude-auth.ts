import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { ROOT, env } from "./env.ts";
import { claudeEnv, redact } from "./runner.ts";

const run = promisify(execFile);

/** Headless runs use a long-lived token from `claude setup-token`. Browser logins expire. */
export async function authStatus(): Promise<{ mode: "oauth-token" | "api-key" | "cli-login"; ok: boolean; detail: string }> {
  const mode = env("CLAUDE_CODE_OAUTH_TOKEN") ? "oauth-token" : env("ANTHROPIC_API_KEY") ? "api-key" : "cli-login";
  try {
    await run(env("CLAUDE_BIN") ?? "claude", ["-p", "Reply with the single word ok.", "--max-turns", "1"], { env: claudeEnv(), timeout: 60_000, encoding: "utf8" });
    return { mode, ok: true, detail: "claude answered" };
  } catch (err) {
    const e = err as { killed?: boolean; stderr?: string; stdout?: string; message?: string };
    const detail = e.killed ? "no answer within 60s" : (e.stderr || e.stdout || e.message || "no output").trim().slice(0, 200);
    return { mode, ok: false, detail: redact(detail) };
  }
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
