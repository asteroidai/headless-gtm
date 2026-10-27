---
name: research-company
description: Research one company from a signal (signup, site visit, GitHub star) and write a short brief. Reads the payload file the server wrote, scores ICP fit against icp/*.md, upserts the company and person in the CRM, posts the brief to Slack, and POSTs a completion. Triggers on `/research-company <payloadPath>`.
---

# research-company

You run headless. Nobody is watching. Never ask a question; make the call and say what you assumed.

## 1. Read the payload

`cat` the file given as the argument. It holds `jobId`, `token`, `completeUrl`, `input` and `signal`.
The signal's `subject` has what we know: `email`, `name`, `company`, `domain`, `url`. Any field can be missing.

No file, or no `jobId`: stop and say why.

## 2. Research (budget: 5 minutes)

Work from the domain when you have one. Otherwise work from the company name, then the person.

- Company: what it does in plain words, size, stage, funding, location. Use `pnpm -s gtm tool apollo enrich-company '{"domain":"<domain>"}'` when apollo is enabled, and `pnpm -s gtm tool exa search '{"query":"<company> <what you need>"}'` for the web. Read the company's own site when the tools are not enabled.
- Person: role and seniority. `pnpm -s gtm tool apollo enrich-person '{"email":"<email>"}'`.
- CRM: `pnpm -s gtm tool attio find-company '{"domain":"<domain>"}'`. An existing record with notes means the team knows them. Say so.

Never invent a funding round, a customer, a number or a quote. Thin research gives a short brief. A short, true brief is correct.

## 3. Score ICP fit

Read every card in `icp/*.md`. Pick the best match or "no fit". Give one reason in one sentence. Use the card's `[fit]` lists and `## Signals` section. A free-mail signup with no company is "unknown", not "no fit".

## 4. Write the brief

Slack mrkdwn. Under 1,500 characters. This shape:

```
*<Company>* (<domain>) - <ICP card or "no fit"> - <one-line reason>
*What they do:* ...
*Size/stage:* ...
*Who:* <name>, <title> (<how we know: signal event>)
*Why now:* the signal and anything that reads as intent
*Suggested next step:* one line. A human decides.
```

Every claim cites a source (a page, a tool result, the signal) or is labelled a guess.

## 5. Complete

One POST, then stop. Include the CRM writes only when `attio` is enabled; include the Slack post only when `slack` is enabled (`pnpm -s gtm list` shows this).

```bash
curl -s -X POST "$completeUrl" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @- <<'JSON'
{
  "summary": "<company>: <ICP or no fit>, <one line>",
  "writes": [
    { "integration": "attio", "action": "upsert-company", "input": { "domain": "<domain>", "name": "<company>", "description": "<one line>" } },
    { "integration": "attio", "action": "upsert-person", "input": { "email": "<email>", "name": "<name>", "title": "<title>", "company_domain": "<domain>" } },
    { "integration": "slack", "action": "post", "input": { "text": "<the brief>" } }
  ]
}
JSON
```

Then reply with one line: company, fit, confidence. Nothing else.
