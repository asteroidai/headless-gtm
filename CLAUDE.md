# headless-gtm

A GTM engine where Claude Code is the backend. A small Hono server turns webhooks and cron jobs into
headless `claude -p "/<skill> <payload>"` runs. Skills do the thinking. Thin adapters write to the CRM and Slack.
A human approves anything that goes to a prospect.

## Layout

```
src/              core (~1k lines): config, queue, runner, signals, cron, routes, cli
integrations/     opt-in shop: <name>/{manifest.json,index.ts,fixtures/,*.test.ts}
.claude/skills/   the skills Claude runs: research-company, pre-demo-brief, draft-first-email, daily-digest, setup, new-integration
icp/              ICP cards: TOML frontmatter + prose. Skills read them for fit and pitch
docs/, deploy/    production setup (Cloudflare Tunnel, launchd)
data/             runtime state (git-ignored): jobs, logs, drafts, signals.jsonl
gtm.config.yaml   what is enabled, event -> skill routes, schedules, settings
```

## How a run works

1. `POST /webhooks/:source` or a cron tick produces `Signal[]` (see `src/types.ts`).
2. `config.on[event]` names a skill. `enqueue()` creates a Job and writes `data/jobs/<id>.json`.
3. `runner.ts` spawns `claude -p "/<skill> data/jobs/<id>.json"` under a concurrency cap and timeout.
4. The skill works, then POSTs `{ summary, writes?, drafts? }` to `completeUrl` with the job `token`.
5. The server runs `writes` through enabled write integrations and stores `drafts` for a human.

A run that exits without posting is still `done`; its final text becomes the summary.

## Conventions

- TypeScript, Node 20+, pnpm, Hono, vitest. Few dependencies. Small files, one job each.
- Comments only where they add something. No ticket numbers.
- Writes to the outside world go through integration actions, never from skills directly. Headless runs have no MCP OAuth session; adapters use API keys.
- Nothing sends email. `draft-first-email` produces a draft; a person sends it.
- Every webhook verifies. Fail closed when a secret is unset.
- Event names are `<source>.<thing>.<verb>`.
- Prose: short sentences, active voice.

## Adding an integration

Run `/new-integration <name>` or follow `integrations/README.md`. Then `pnpm gtm add <name>`.

## Running

```
pnpm dev                       # server on :5005, reloads on change
pnpm gtm list|add|tool|run|pull|webhook
pnpm test && pnpm typecheck    # must pass before a PR
```

Tests mock `fetch` and use `test/fake-claude.sh` in place of the real CLI. No live keys are needed.
