/**
 * A real, minimal, spec-correct RFC 5545 .ics builder — a plain text format,
 * genuinely importable by Google Calendar/Outlook/Apple Calendar, no
 * Calendar API or credentials needed.
 */
export interface IcsInviteInput {
  title: string;
  description?: string;
  startsAt: Date;
  durationMinutes: number;
  organizerEmail: string;
  attendeeEmail: string;
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcsInvite(input: IcsInviteInput): string {
  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  const uid = `${crypto.randomUUID()}@kvlgrowthos.local`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KVL GrowthOS//Outreach Assistant//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(input.startsAt)}`,
    `DTEND:${toIcsDate(endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : null,
    `ORGANIZER:mailto:${input.organizerEmail}`,
    `ATTENDEE;RSVP=TRUE:mailto:${input.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  return lines.join("\r\n");
}
