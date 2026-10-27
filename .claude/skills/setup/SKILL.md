---
name: setup
description: Walk a new user through setting up headless-gtm - pick integrations, fill .env, write a first ICP card from their customers, start the server and a tunnel, fire a test webhook. Triggers on `/setup`.
---

# setup

You are talking to a founder who just cloned this repo. Go step by step. Ask one question at a time. Do each step for them where you can.

## 1. Check the basics

Run `node --version` (need 20.12+), `pnpm --version`, `claude --version`. Run `pnpm install` if `node_modules/` is missing. Copy `.env.example` to `.env` if `.env` is missing.

Ask how they run Claude: a subscription (then run `claude setup-token` and put the token in `CLAUDE_CODE_OAUTH_TOKEN`) or an API key (`ANTHROPIC_API_KEY`). Tell them to check Anthropic's terms for their usage.

## 2. Choose integrations

Run `pnpm -s gtm list`. Explain the four kinds in one line each: signals (things that happen), pulls (things we fetch daily), tools (reads inside skills), writes (CRM and Slack).

Ask what they already use. Then for each pick run `pnpm -s gtm add <name>`. Read what it prints and ask for each env var it names. Write the values into `.env` yourself. Never echo a secret back.

A good first set: `slack` (so they see results) plus one signal they can fire today (`cal-com` or `signup`).

## 3. Write the first ICP card

Ask: "Name three customers who were easy to close and are happy." Then for each: what they do, size, who signed, why they bought.

From the answers write `icp/<slug>.md` using `icp/example.md` as the shape. Fill the TOML `[fit]` block from the pattern across the three. Write `## Pitch` in the founder's own words from this conversation. Leave `## Proof` with only claims they said out loud and agreed are true. Show the card and ask for one correction.

Remove `icp/example.md` only if they ask.

## 4. Start the server

Run `pnpm dev` in the background. Confirm `curl -s localhost:5005/healthz`. Open `http://localhost:5005`.

## 5. Expose it

Run `cloudflared tunnel --url http://localhost:5005` in the background (or `ngrok http 5005`). Read the public URL from its output. Tell them the webhook URL is `<public>/webhooks/<source>`, and which header or query the source needs (the manifest's `env` says). For Cal.com: Settings, Developer, Webhooks, subscriber URL, trigger "Booking created", secret = `CALCOM_WEBHOOK_SECRET`.

For a production box point them at `docs/deploy-mac-mini.md`.

## 6. Fire a test

Run `pnpm -s gtm webhook <source>`. It replays the recorded fixture with a valid signature at the local server. Then poll `curl -s localhost:5005/jobs | head -c 600` until the job is `done`, and show the Slack message or the `summary`. If the job failed, `cat` its log from `data/jobs/<id>.log` and fix the cause with them.

## 7. Hand over

Say in five lines: what runs now, where results land (Slack, `/drafts`, `/`), how to add an integration (`pnpm gtm add`), where the config is (`gtm.config.yaml`), and that nothing sends email, ever, without a human.
