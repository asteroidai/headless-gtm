# Integrations

One folder per integration. Nothing runs until `gtm.config.yaml` lists it.

```
integrations/<name>/
  manifest.json       what it is, what it needs, what it emits
  index.ts            default export: { handle?, sign?, pull?, actions? }
  fixtures/*.json     a recorded payload or API response
  <name>.test.ts      replays the fixture with fetch mocked; no live keys
```

## manifest.json

```json
{
  "name": "cal-com",
  "kind": "signal",
  "description": "One sentence.",
  "env": [{ "name": "CALCOM_WEBHOOK_SECRET", "required": true, "about": "Where to get it" }],
  "events": ["cal-com.booking.created"],
  "skills": ["pre-demo-brief"],
  "schedule": "0 9 * * *",
  "defaults": { "on": { "cal-com.booking.created": "pre-demo-brief" }, "settings": { "key": "value" } }
}
```

| kind | exports | called by |
|---|---|---|
| `signal` | `handle(req, settings)` returns `Signal[]`, or `null` when the request fails verification. `sign(rawBody)` adds the header or query the source would send. | `POST /webhooks/<name>` |
| `pull` | `pull({ settings, state })` returns new items as `Signal[]`. Mutate `state`; the server persists it. | the schedule, or `POST /pulls/<name>/run` |
| `tool` | `actions: { name(input, settings) }` reads. | skills, via `pnpm gtm tool <name> <action> '<json>'` |
| `write` | `actions: { name(input, settings) }` writes. | a completion's `writes`, and `gtm tool` |

Event names are `<name>.<thing>.<verb>`. `makeSignal()` enforces the prefix.

Rules:
- Verify every webhook. Fail closed when the secret is unset.
- Keep API responses compact. Return the fields a skill needs, not the whole object.
- No live network in tests. Mock `fetch` and replay a fixture.
- Fixtures use `example.com`-style domains and made-up people.
