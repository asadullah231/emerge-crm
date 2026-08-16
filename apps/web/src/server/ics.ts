/**
 * Minimal RFC 5545 iCalendar (.ics) builder for interview invites. Enough for
 * Google Calendar and Outlook to import a single event with attendees. No
 * external dependency; calendar OAuth two-way sync is a later milestone.
 */
export type IcsAttendee = { email: string; name?: string | null };

export type IcsEvent = {
  uid: string;
  start: Date;
  durationMins: number;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer?: IcsAttendee | null;
  attendees?: IcsAttendee[];
  status?: "CONFIRMED" | "CANCELLED";
  /** Bumped on reschedule/cancel so clients replace the prior event. */
  sequence?: number;
  /** Stamp time; pass explicitly so the output is deterministic in tests. */
  stamp?: Date;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC timestamp in iCalendar basic format: 20260101T090000Z. */
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT value per RFC 5545 (backslash, comma, semicolon, newlines). */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to 75 octets with CRLF + single leading space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

export function buildIcs(event: IcsEvent): string {
  const stamp = event.stamp ?? event.start;
  const end = new Date(event.start.getTime() + event.durationMins * 60_000);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EmergeTech//Emerge CRM//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${event.status ?? "CONFIRMED"}`,
    `SUMMARY:${esc(event.summary)}`
  ];
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.url) lines.push(`URL:${esc(event.url)}`);
  if (event.organizer?.email) {
    const cn = event.organizer.name ? `;CN=${esc(event.organizer.name)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${event.organizer.email}`);
  }
  for (const a of event.attendees ?? []) {
    if (!a.email) continue;
    const cn = a.name ? `;CN=${esc(a.name)}` : "";
    lines.push(`ATTENDEE${cn};RSVP=TRUE:mailto:${a.email}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
