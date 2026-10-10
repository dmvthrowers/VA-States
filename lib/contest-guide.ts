/**
 * Contest guide page (master plan T18, O1): the small pure pieces. Times are shown in the venue's time
 * zone and, when it differs, the reader's own, so a deadline is never ambiguous.
 */

/** "13:05" → "1:05 PM" */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "March 11, 2027, 11:59 PM CST" for an instant in a time zone */
export function instantLabel(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
  }).format(d);
}

export interface DeadlineLabels {
  /** In the venue's time zone: always shown */
  venue: string;
  /** In the reader's time zone, or null when it is the same label as the venue's (or unknown) */
  reader: string | null;
}

export function deadlineLabels(iso: string, venueZone: string, readerZone: string | null): DeadlineLabels {
  const venue = instantLabel(iso, venueZone);
  if (!readerZone || !venue) return { venue, reader: null };
  let reader: string;
  try { reader = instantLabel(iso, readerZone); } catch { return { venue, reader: null }; }
  return { venue, reader: reader && reader !== venue ? reader : null };
}

/** "1:30" for 90 seconds, "3:00" for 180; null when unknown */
export function routineLabel(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
