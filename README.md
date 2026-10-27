# headless-gtm

A GTM engine for founders, with Claude Code as the backend.

Four building blocks:

1. **Claude Code is the backend.** A small server spawns headless `claude -p "/<skill> <payload>"` runs with a concurrency cap, a timeout, a log per job, and an endpoint the agent POSTs its result to. There is very little deterministic code.
2. **Webhooks are signals.** `POST /webhooks/:source`. Each source verifies its own secret and turns the payload into a `Signal`. The config maps a signal to a skill.
3. **Cron jobs are pulls.** Schedules in config fetch new items from an API (new stargazers, keyword mentions) and route them the same way.
4. **Skills are markdown.** `.claude/skills/*/SKILL.md` tells Claude what to do, step by step.

Plus **writes**: thin adapters for a CRM (Attio) and Slack. A human approves before anything reaches a prospect. Nothing here sends email.

## Quickstart (about 10 minutes)

You need Node 20.12+, pnpm, and the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) logged in.

```sh
git clone https://github.com/asteroidai/headless-gtm && cd headless-gtm
pnpm install
cp .env.example .env         # fill CALCOM_WEBHOOK_SECRET (any string you choose) and the Slack vars
pnpm dev                     # http://localhost:5005
```

In another terminal, expose the port:

```sh
cloudflared tunnel --url http://localhost:5005   # or: ngrok http 5005
```

In Cal.com: Settings, Developer, Webhooks, New. Subscriber URL `https://<your-tunnel>/webhooks/cal-com`, trigger "Booking created", secret = your `CALCOM_WEBHOOK_SECRET`. Book a test slot.

Or skip Cal.com and replay the recorded fixture:

```sh
pnpm gtm webhook cal-com
```

Open http://localhost:5005. The job appears, `claude` runs `/pre-demo-brief`, and the brief lands in Slack (or in the job summary when Slack is not enabled).

Or let Claude Code do the setup with you: open `claude` in the repo and type `/setup`.

## Config

Everything is in `gtm.config.yaml`. Nothing runs unless it is listed there.

```yaml
integrations: [cal-com, slack, attio, exa]
on:
  cal-com.booking.created: pre-demo-brief
  signup.created: research-company
schedules:
  - { name: github-stargazers, cron: "0 9 * * *", pull: github-stargazers }
  - { name: weekly-digest, cron: "0 8 * * 1", skill: daily-digest }
settings:
  github-stargazers: { repos: ["yourorg/yourrepo"] }
```

`pnpm gtm add <integration>` enables one, merges its defaults, and prints the env vars to set.

## Integrations

| kind | name | what |
|---|---|---|
| signal | `cal-com` | a booking becomes a pre-demo brief |
| signal | `signup` | your app POSTs `{email, name?, company?}` with a shared secret |
| signal | `rb2b` | an identified website visitor |
| pull | `github-stargazers` | new stargazers of your repos, daily |
| pull | `hn-reddit-keywords` | daily keyword scan of HN and Reddit, digest to Slack |
| tool | `exa` | web search inside skills |
| tool | `apollo` | company and person enrichment |
| write | `attio` | upsert company and person, add a note |
| write | `slack` | post a message or thread reply |

Each folder has a manifest, the code, a recorded fixture and a test. See `integrations/README.md` for the contract and `/new-integration` to scaffold one.

## Skills

| skill | trigger | result |
|---|---|---|
| `research-company` | signup, visitor, star | brief to Slack, company and person in the CRM |
| `pre-demo-brief` | booking | brief to Slack before the call |
| `draft-first-email` | manual or signal | one email draft, stored at `/drafts` for review |
| `daily-digest` | schedule or keyword pull | one Slack message |
| `setup` | you, in Claude Code | walks you through setup |
| `new-integration` | you, in Claude Code | scaffolds an integration |

A skill reads a payload file (`jobId`, `token`, `completeUrl`, `input`, `signal`), does its work, and POSTs:

```json
{ "summary": "one line",
  "writes": [{ "integration": "slack", "action": "post", "input": { "text": "..." } }],
  "drafts": [{ "kind": "email", "to": "...", "subject": "...", "body": "..." }] }
```

The server applies the writes and keeps the drafts. Skills read tools with `pnpm gtm tool <integration> <action> '<json>'`.

## ICP cards

`icp/*.md` holds one card per segment: TOML frontmatter for the machine (fit, titles, sender) and prose for Claude (pitch, proof, signals, disqualifiers). Skills read every card to judge fit and to draft. Start from `icp/example.md`.

## Claude auth and cost

Headless runs use the Claude Code CLI. It runs on a Claude subscription (`claude setup-token`, then `CLAUDE_CODE_OAUTH_TOKEN`) or on an API key (`ANTHROPIC_API_KEY`). With both set, the subscription token wins. Check Anthropic's terms for your usage. A browser login expires; a long-lived token does not, and `POST /admin/claude-auth` rotates it without touching the box.

Headless runs have no MCP OAuth sessions. Writes go through the server's adapters with API keys.

## HTTP API

```
POST /webhooks/:source          signal in (verified by the integration)
GET  /jobs, /jobs/:id, /jobs/:id/log
POST /jobs/run                  {skill, input}            admin
POST /jobs/:id/complete         the agent's result        job token
POST /pulls/:name/run           run a pull now            admin
POST /schedules/:name/run       run a schedule now        admin
GET  /drafts, /drafts/:id       what waits for a human
GET  /integrations, /healthz
GET  /admin/claude-auth         probe; POST {token} rotates it   admin
GET  /                          dashboard
```

Admin routes need `Authorization: Bearer $ADMIN_TOKEN` when it is set. In production put the dashboard behind Cloudflare Access and expose only `/webhooks/*` publicly. See `docs/deploy-mac-mini.md`.

## Develop

```sh
pnpm test        # vitest; fetch is mocked, claude is a shell script
pnpm typecheck
```

MIT. Built by [Asteroid](https://asteroid.ai) from the engine that runs its own GTM.
