/**
 * Minimal iCalendar (.ics) builder for VSYC-26 — no external dependency needed.
 * Event date/time is a placeholder window (10 AM–6 PM ET) until the exact
 * day-of schedule is finalized; see vsyc26-schedule.html for the real agenda.
 */

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  // RFC 5545: content lines should be folded at 75 octets.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

export function buildVsyc26Ics(opts: { uid: string; summary?: string; description?: string }): string {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DMV Throwers//VSYC-26//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@dmvthrowers.club`,
    `DTSTAMP:${dtstamp}`,
    // Sept 19, 2026, 10:00 AM–6:00 PM ET (UTC-4) — placeholder window.
    'DTSTART:20260919T140000Z',
    'DTEND:20260919T220000Z',
    `SUMMARY:${escapeICS(opts.summary ?? 'VSYC-26 — Virginia State Yo-Yo Contest')}`,
    `DESCRIPTION:${escapeICS(
      opts.description ??
        'Virginia State Yo-Yo Contest 2026, organized by DMV Throwers. Full day-of schedule: https://dmvthrowers.club/vsyc26-schedule.html',
    )}`,
    `LOCATION:${escapeICS('Dulles Town Center, 21100 Dulles Town Cir, Sterling, VA 20166')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
