---
name: pre-demo-brief
description: Someone booked a demo. Research the booker and their company fast and post a brief the host reads before the call. Reads the payload file the server wrote (a cal-com.booking.created signal), POSTs a completion with a Slack write. Triggers on `/pre-demo-brief <payloadPath>`.
---

# pre-demo-brief

A demo is booked. Give the host the head start: who booked, why they probably booked, what to show, what to ask. You run headless minutes after the booking. Speed and honesty beat completeness.

## 1. Read the payload

`cat` the argument. `signal.subject` has `email`, `name`, `domain`. `signal.payload` has `startTime`, `eventTitle`, `notes` (what they typed in the booking form) and `meetingUrl`. The notes are often the real question. Quote them.

## 2. Gather (budget: 5 minutes, hard)

Run these together where you can. Skip any source that stalls.

- CRM: `pnpm -s gtm tool attio find-person '{"email":"<email>"}'` and `find-company` by domain. An existing record tells you how we met them.
- Company: `pnpm -s gtm tool apollo enrich-company '{"domain":"<domain>"}'`, then `pnpm -s gtm tool exa search '{"query":"<company>"}'`. What they do, size, stage, recent news.
- Person: role, and anything public that reads as the pain they want solved.
- Cards: the closest `icp/*.md` card. Use its pitch and proof points. Do not invent customers.

A booking from a personal email with no company is common. Say what the web tells you and mark the rest unknown.

## 3. Write the brief

Slack mrkdwn (`*bold*`, `•` bullets, no `#` headers). Under 2,000 characters.

```
*Demo:* <name>, <title> at <company> - <start time in the host's words, e.g. Thu 16:00 UTC>
*Source:* inbound booking (<what the notes say, quoted>) | known in CRM since <date> | unknown
*Company:* what they do, size, stage. ICP: <card> or "not ICP, closest: ...".
*Likely use case:* 2-3 concrete things they probably want, each with a confidence word (likely / maybe / guess)
*Show:* the one flow to demo first
*Ask:* 3-4 questions written for this booker, in order
*Watch for:* the one or two likely objections
```

A wrong confident claim in front of the prospect is the failure. "Unknown, ask on the call" is a fine entry.

## 4. Complete

```bash
curl -s -X POST "$completeUrl" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d @- <<'JSON'
{
  "summary": "<company>: <ICP> - <one line>",
  "writes": [
    { "integration": "slack", "action": "post", "input": { "text": "<the brief>" } }
  ]
}
JSON
```

Drop the Slack write when `slack` is not enabled; the summary still lands on the dashboard. Then reply with one line: the company, your confidence, and whether the CRM knew them.
