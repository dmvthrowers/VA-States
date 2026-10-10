/**
 * Events and organizers (multi-event design, docs/MULTI_EVENT.md, stage 1a). Pure: no imports, so it is tested without
 * the app. `contest.config.ts` builds the default event from its own `contest` settings, and any extra events from
 * the `events` list, so a one-event deployment behaves exactly as it did before.
 */

export type EventStatus = 'draft' | 'open' | 'closed' | 'archived';

export interface OrganizerDef {
  /** Short lowercase slug, e.g. "dmv-throwers". */
  id: string;
  name: string;
  url: string;
  contactEmail: string;
}

export interface EventVenue {
  name: string;
  streetAddress?: string;
  city: string;
  region: string;
  postalCode?: string;
  country?: string;
}

export interface EventDef {
  /** Short lowercase slug, used in URLs (`/e/<id>/…`) and as the `event_id` of the event's data. */
  id: string;
  organizerId: string;
  name: string;
  shortName: string;
  /** Every day of the event as YYYY-MM-DD in the venue's time zone, earliest first. `dates[0]` is the main day. */
  dates: string[];
  /** 24-hour "HH:MM" on the main day, for calendar invites. */
  startTime: string;
  endTime: string;
  /** IANA time zone of the venue. */
  timeZone: string;
  venue: EventVenue;
  /** Deadlines as ISO timestamps with the venue's UTC offset. */
  deadlines: Record<string, string>;
  status: EventStatus;
}

/** What a deployment's own `events` list holds for each extra event: everything but the status is required. */
export type EventInput = Omit<EventDef, 'status'> & { status?: EventStatus };

/** The slice of `contest` the default event is built from (structural, so this file imports nothing). */
export interface ContestSource {
  /** Optional explicit id for the default event; otherwise derived from `shortName`. */
  eventId?: string;
  name: string;
  shortName: string;
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  venue: EventVenue;
  deadlines: Record<string, string>;
  organizer: { name: string; url: string };
  contactEmail: string;
}

export const SLUG_RE = /^[a-z][a-z0-9-]{0,39}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "VSYC-26" → "vsyc-26", "Spring Jam 2027!" → "spring-jam-2027". Never empty and always starts with a letter. */
export function slugify(text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) return 'event';
  const withLetter = /^[a-z]/.test(base) ? base : `e-${base}`;
  return withLetter.slice(0, 40).replace(/-+$/g, '');
}

/** The organizer of the default event, from the contest's own settings. */
export function defaultOrganizer(c: ContestSource): OrganizerDef {
  return { id: slugify(c.organizer.name), name: c.organizer.name, url: c.organizer.url, contactEmail: c.contactEmail };
}

/** The default event: today's single event, read from `contest`. */
export function defaultEventFrom(c: ContestSource): EventDef {
  return {
    id: c.eventId && c.eventId.trim() ? c.eventId.trim() : slugify(c.shortName),
    organizerId: defaultOrganizer(c).id,
    name: c.name,
    shortName: c.shortName,
    dates: [c.date],
    startTime: c.startTime,
    endTime: c.endTime,
    timeZone: c.timeZone,
    venue: { ...c.venue },
    deadlines: { ...c.deadlines },
    status: 'open',
  };
}

/** The default event first, then the deployment's own extra events (status defaults to `open`). */
export function buildEvents(c: ContestSource, extra: readonly EventInput[] = []): EventDef[] {
  return [defaultEventFrom(c), ...extra.map((e): EventDef => ({ ...e, dates: [...e.dates], venue: { ...e.venue }, deadlines: { ...e.deadlines }, status: e.status ?? 'open' }))];
}

/** Organizers: the default one, then any extra the deployment lists (ids must be unique). */
export function buildOrganizers(c: ContestSource, extra: readonly OrganizerDef[] = []): OrganizerDef[] {
  return [defaultOrganizer(c), ...extra];
}

/** Plain-words problems with the events and organizers, or [] when they are sound. */
export function eventIssues(events: readonly EventDef[], organizers: readonly OrganizerDef[]): string[] {
  const out: string[] = [];
  const orgIds = new Set<string>();
  for (const o of organizers) {
    if (!SLUG_RE.test(o.id)) out.push(`Organizer "${o.id}": the id must be a short lowercase slug (letters, digits, dashes; starts with a letter).`);
    if (orgIds.has(o.id)) out.push(`Organizer "${o.id}" is listed twice.`);
    orgIds.add(o.id);
    if (!o.name.trim()) out.push(`Organizer "${o.id}" has no name.`);
  }
  if (events.length === 0) out.push('There must be at least one event.');
  const ids = new Set<string>();
  for (const e of events) {
    const at = `Event "${e.id}"`;
    if (!SLUG_RE.test(e.id)) out.push(`${at}: the id must be a short lowercase slug (letters, digits, dashes; starts with a letter).`);
    if (ids.has(e.id)) out.push(`${at} is listed twice.`);
    ids.add(e.id);
    if (!orgIds.has(e.organizerId)) out.push(`${at}: organizer "${e.organizerId}" is not in the organizers list.`);
    if (!e.name.trim() || !e.shortName.trim()) out.push(`${at} needs a name and a short name.`);
    if (e.dates.length === 0) out.push(`${at} needs at least one date.`);
    for (const d of e.dates) {
      if (!DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) out.push(`${at}: "${d}" is not a date (use YYYY-MM-DD).`);
    }
    if (e.dates.some((d, i) => i > 0 && d <= e.dates[i - 1])) out.push(`${at}: dates must be earliest first, with none repeated.`);
    if (!TIME_RE.test(e.startTime) || !TIME_RE.test(e.endTime)) out.push(`${at}: start and end times must be 24-hour HH:MM.`);
    else if (e.endTime <= e.startTime) out.push(`${at}: the end time must be after the start time.`);
    if (!e.timeZone.trim()) out.push(`${at} needs a time zone.`);
    if (!e.venue.name.trim() || !e.venue.city.trim()) out.push(`${at} needs a venue name and city.`);
    for (const [k, v] of Object.entries(e.deadlines)) {
      if (Number.isNaN(Date.parse(v))) out.push(`${at}: the "${k}" deadline is not a date and time.`);
    }
  }
  return out;
}

/** The event with this id, or undefined. */
export const eventById = (events: readonly EventDef[], id: string): EventDef | undefined => events.find((e) => e.id === id);

/**
 * The event a request is about: the one named, or the default (the first). A name that matches nothing gives
 * undefined, so a route can answer 404 instead of quietly showing the default event.
 */
export function eventOf(events: readonly EventDef[], id?: string | null): EventDef | undefined {
  return id === undefined || id === null || id === '' ? events[0] : eventById(events, id);
}

export const organizerOf = (organizers: readonly OrganizerDef[], event: EventDef): OrganizerDef | undefined =>
  organizers.find((o) => o.id === event.organizerId);
