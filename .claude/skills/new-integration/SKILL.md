---
name: new-integration
description: Scaffold a new integration folder (manifest, handler or pull or actions, fixture, test) from the contract in integrations/README.md. Triggers on `/new-integration <name>` or "add an integration for X".
---

# new-integration

Read `integrations/README.md` first. Then read one existing integration of the same kind as a model: `cal-com` (signal), `github-stargazers` (pull), `exa` (tool), `slack` (write).

## 1. Decide the kind

Ask once if it is not clear: does the source call us (signal), do we fetch on a schedule (pull), do skills read from it (tool), or do we write to it (write)?

## 2. Find the real payload

Look up the source's webhook or API docs. Record one real-shaped example in `fixtures/`. Use made-up people and `example.com`-style domains. Note how the source authenticates (HMAC header, shared token, bearer).

## 3. Write the files

`integrations/<name>/manifest.json`: name equals the folder; kind; one-sentence description; every env var with where to get it; events as `<name>.<thing>.<verb>`; the skill the default route points at; `defaults.on`; for a pull, `schedule` and `defaults.settings`.

`integrations/<name>/index.ts`: default export `Integration`. Signals: `handle` returns `null` on a failed check (fail closed when the secret is unset) and `Signal[]` otherwise, built with `makeSignal(source, event, subject, payload, occurredAt)`; `sign(rawBody)` produces the same auth so `gtm webhook` and tests can replay. Pulls: `pull({ settings, state })` keeps a watermark in `state`. Tools and writes: `actions` with short input docs, compact outputs, `requireEnv` for keys, `fetchJson` for HTTP.

`integrations/<name>/<name>.test.ts`: vitest, `vi.stubGlobal("fetch", ...)`, replay the fixture, assert the signal or the request body. No live network.

If the integration needs a new skill, write `.claude/skills/<skill>/SKILL.md` in the shape of `research-company`: read payload, work, one completion POST.

## 4. Verify

Run `pnpm typecheck` and `pnpm test`. Then `pnpm -s gtm add <name>` and show the user the env vars to set. Keep the whole integration under 150 lines where you can.
