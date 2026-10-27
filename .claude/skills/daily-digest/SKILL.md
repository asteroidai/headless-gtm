---
name: daily-digest
description: Turn a day of signals into one Slack message a founder reads in a minute. Runs from a schedule or from the hn-reddit-keywords pull. Reads data/signals.jsonl and the pull's mentions, picks what matters, posts one digest. Triggers on `/daily-digest <payloadPath>`.
---

# daily-digest

One message. What happened, what deserves a reply, nothing else.

## 1. Read the payload

`cat` the argument. Two shapes:

- From the keyword pull: `signal.payload.items` is a list of HN and Reddit mentions (`source`, `title`, `url`, `author`, `snippet`, `keyword`).
- From a schedule: `input.schedule` is set and there are no items. Then read the last 24 hours from `data/signals.jsonl` (one JSON signal per line; filter on `receivedAt`).

## 2. Judge

For keyword mentions: keep a post when the author has the problem we solve, asks for a tool like ours, or compares tools in our category. Drop news reposts, job ads and anything where the keyword is incidental. Read the ICP cards in `icp/*.md` to know what "our category" means. Rank the keepers: a question we can answer first, a complaint second, a mention third.

For signals: group by event. Count them. Name the two or three worth a human's attention today (a known company signed up, a repeat visitor on pricing, a booking) and say why in one clause each.

## 3. Write

Slack mrkdwn, under 1,500 characters:

```
*Daily digest - <date>*
*Worth a reply* (<n>)
• <title> - <source>, <why in six words> - <url>
*Also seen* (<n>)
• <one line each, max 5>
*Signals in the last 24h:* <n> signups, <n> visits, <n> bookings, <n> stars
```

Skip a section that is empty. Never summarise a post you did not read.

## 4. Complete

```bash
curl -s -X POST "$completeUrl" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @- <<'JSON'
{ "summary": "<n> worth a reply, <n> also seen", "writes": [ { "integration": "slack", "action": "post", "input": { "text": "<the digest>" } } ] }
JSON
```

When `slack` is not enabled, put the digest in `summary` instead and send no writes.
