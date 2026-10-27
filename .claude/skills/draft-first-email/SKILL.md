---
name: draft-first-email
description: Draft one first email to one person for a human to review. Never sends. Reads the payload file the server wrote (a signal or a manual run with email/domain), researches briefly, writes one short email, and POSTs it as a draft. Triggers on `/draft-first-email <payloadPath>`.
---

# draft-first-email

You write one email. A human reads it on the dashboard (`/drafts`) and decides. Nothing here sends.

## 1. Read the payload

`cat` the argument. Use `signal.subject` when there is a signal, else `input` (`email`, `name`, `domain`, `company`, `context`).

No email address and no name plus domain: complete with `summary: "skipped: no recipient"` and no drafts.

## 2. Know who you write to (budget: 3 minutes)

- `pnpm -s gtm tool attio find-person '{"email":"<email>"}'`. If the CRM shows a reply or a meeting, stop: complete with `summary: "skipped: already in conversation"`.
- `pnpm -s gtm tool apollo enrich-person` and `enrich-company` when enabled; `exa search` for one recent, true, specific fact about the company.
- Read the matching `icp/*.md` card. Its `## Pitch` and `## Proof` sections are the only claims you may make about us.

## 3. Write

Rules:
- Under 90 words. One idea. One ask.
- First line is about them: the signal (they signed up, they starred the repo, they visited pricing) or the one true fact you found. No flattery.
- Second part: what we do for people like them, in the card's words.
- Ask: a yes/no question or a 15-minute call. No calendar links unless the card gives one.
- Plain text. No bullet points, no bold, no em dashes, no "I hope this finds you well".
- Never invent a customer, a metric or a quote. Use only the card's `## Proof`.
- Sign as the card's `[sender]` name.

Subject: under 6 words, lower-case is fine, no clickbait.

## 4. Complete

```bash
curl -s -X POST "$completeUrl" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @- <<'JSON'
{
  "summary": "draft for <name> at <company>: <angle in five words>",
  "drafts": [
    { "kind": "email", "to": "<email>", "subject": "<subject>", "body": "<the email>" }
  ]
}
JSON
```

Then reply with one line: who, the angle, and anything the reviewer should check before sending.
