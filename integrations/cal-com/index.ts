import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../src/env.ts";
import { obj, str } from "../../src/http.ts";
import { domainOf, makeSignal } from "../../src/signals.ts";
import type { Integration, Signal } from "../../src/types.ts";

/** Cal.com sends HMAC-SHA256(body, secret) as hex in `x-cal-signature-256`. */
export function verify(rawBody: string, signature: string | undefined, secret = env("CALCOM_WEBHOOK_SECRET")): boolean {
  if (!secret) return false;
  const sig = signature?.trim().toLowerCase();
  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}

export function parse(body: unknown): Signal[] {
  const b = obj(body);
  if (str(b.triggerEvent) !== "BOOKING_CREATED") return [];
  const p = obj(b.payload);
  const attendee = obj((Array.isArray(p.attendees) ? p.attendees : [])[0]);
  const email = str(attendee.email);
  if (!email) return [];
  const responses = obj(p.responses);
  const notes = str(obj(responses.notes).value) ?? str(p.additionalNotes);
  return [
    makeSignal(
      "cal-com",
      "cal-com.booking.created",
      { email, name: str(attendee.name), domain: domainOf(email) },
      {
        bookingUid: str(p.uid),
        eventTitle: str(p.eventTitle) ?? str(p.title),
        startTime: str(p.startTime),
        endTime: str(p.endTime),
        timeZone: str(attendee.timeZone),
        notes,
        organizer: str(obj(p.organizer).email),
        meetingUrl: str(p.videoCallUrl) ?? str(obj(p.metadata).videoCallUrl),
      },
      str(b.createdAt),
    ),
  ];
}

const integration: Integration = {
  handle(req) {
    if (!verify(req.rawBody, req.headers["x-cal-signature-256"])) return null;
    return parse(req.body);
  },
  sign(rawBody) {
    const secret = env("CALCOM_WEBHOOK_SECRET") ?? "";
    return { headers: { "x-cal-signature-256": createHmac("sha256", secret).update(rawBody, "utf8").digest("hex") } };
  },
};

export default integration;
