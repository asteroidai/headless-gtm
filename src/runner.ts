import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ROOT, env } from "./env.ts";

export interface RunOptions {
  skill: string;
  arg: string;
  logPath: string;
  timeoutMs: number;
  maxTurns: number;
}

export interface RunOutcome {
  ok: boolean;
  timedOut: boolean;
  exitCode: number | null;
  /** The agent's final text, from the stream-json `result` event. */
  resultText?: string;
  costUsd?: number;
  error?: string;
}

const live = new Set<ChildProcess>();

/** Kill the agent and everything it spawned (it runs in its own process group). */
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/** Kill every running agent. Call on shutdown so none outlive the server. */
export function killAll(): void {
  for (const c of live) killTree(c);
}

export function claudeEnv(): NodeJS.ProcessEnv {
  const child = { ...process.env };
  // A subscription token wins. With both set, `claude` would bill the API key.
  if (child.CLAUDE_CODE_OAUTH_TOKEN) delete child.ANTHROPIC_API_KEY;
  return child;
}

/** Spawn `claude -p "/<skill> <arg>"` and resolve when it exits. */
export function runClaude(opts: RunOptions): Promise<RunOutcome> {
  mkdirSync(dirname(opts.logPath), { recursive: true });
  const log = createWriteStream(opts.logPath, { flags: "a" });
  log.write(`# ${new Date().toISOString()} /${opts.skill} ${opts.arg}\n`);

  return new Promise((resolve) => {
    const child = spawn(
      env("CLAUDE_BIN") ?? "claude",
      [
        "-p",
        `/${opts.skill} ${opts.arg}`,
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        String(opts.maxTurns),
        "--dangerously-skip-permissions",
      ],
      { cwd: ROOT, env: claudeEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    live.add(child);

    let buffer = "";
    let result: { is_error?: boolean; result?: string; total_cost_usd?: number } | null = null;
    let stderr = "";
    let timedOut = false;

    child.stdout!.on("data", (chunk: Buffer) => {
      log.write(chunk);
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev?.type === "result") result = ev;
        } catch {
          // partial line
        }
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      log.write(chunk);
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    let settled = false;
    const settle = (o: RunOutcome, tail: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      live.delete(child);
      log.end(tail);
      resolve(o);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // A grandchild can hold the pipe open after the kill. Do not wait for it.
      setTimeout(() => settle({ ok: false, timedOut: true, exitCode: null, error: "killed on timeout" }, "\nkilled on timeout\n"), 2000);
    }, opts.timeoutMs);

    child.on("error", (err) => {
      settle({ ok: false, timedOut: false, exitCode: null, error: `could not spawn claude: ${err.message}` }, `\nspawn error: ${err.message}\n`);
    });

    // `close`, not `exit`: close waits for stdout to drain, so the result line is in.
    child.on("close", (code) => {
      const ok = code === 0 && !timedOut && !result?.is_error;
      settle({
        ok,
        timedOut,
        exitCode: code,
        resultText: result?.result,
        costUsd: result?.total_cost_usd,
        error: ok ? undefined : describe({ code, timedOut, resultText: result?.result, stderr }),
      }, `\nexit ${code}\n`);
    });
  });
}

function describe(o: { code: number | null; timedOut: boolean; resultText?: string; stderr: string }): string {
  if (o.timedOut) return "killed on timeout";
  const text = o.resultText?.trim();
  if (text) return redact(text).slice(0, 300);
  const tail = o.stderr.split("\n").map((l) => l.trim()).filter(Boolean).slice(-3).join(" | ");
  return redact(`claude exited with code ${o.code}${tail ? `: ${tail}` : ""}`).slice(0, 300);
}

/** The CLI echoes env values in some errors. Keep tokens out of job records. */
export function redact(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[token]");
}
