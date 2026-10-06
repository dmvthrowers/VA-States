/**
 * Pure logic for the live schedule and side events. Import-free (type-only imports) so
 * `npm test` runs it under plain Node; callers pass the clock and time-zone conversion.
 */
import type { ScheduleItem, SideEventDef } from '@/contest.config';

export type ScheduleStatus = 'upcoming' | 'live' | 'judging' | 'done';

/** What the database remembers about a block (vsyc_schedule_state). */
export interface ScheduleState {
  item_id: string;
  status: ScheduleStatus;
  started_at: string | null;
  /** When the performances ended (Close judging, or Done for unjudged blocks) */
  ended_at: string | null;
  /** When results went public (Publish results) */
  published_at: string | null;
}

export interface LiveItem extends ScheduleItem {
  status: ScheduleStatus;
  planned_start: Date;
  est_start: Date;
  est_end: Date;
  /** Minutes behind (+) or ahead (−) of plan; 0 when on time */
  delay_minutes: number;
  results_published: boolean;
}

const MIN = 60_000;

/**
 * Estimated times for the whole day. Started blocks use their real times; a live block runs
 * at least until now; later blocks follow the one before (never before their planned start
 * unless allowEarly); fixed blocks stay put.
 */
export function liveSchedule(
  items: ScheduleItem[],
  states: ScheduleState[],
  now: Date,
  toInstant: (hhmm: string) => Date,
  allowEarly = false,
): LiveItem[] {
  const byId = new Map(states.map((s) => [s.item_id, s]));
  let cursor: number | null = null;
  return items.map((item) => {
    const st = byId.get(item.id);
    const status: ScheduleStatus = st?.status ?? 'upcoming';
    const planned = toInstant(item.start).getTime();
    const len = item.minutes * MIN;
    let start: number;
    if (st?.started_at) start = new Date(st.started_at).getTime();
    else if (item.fixed || cursor === null) start = planned;
    else start = allowEarly ? cursor : Math.max(planned, cursor);
    // An unstarted block can't be estimated to start in the past.
    if (!st?.started_at && status === 'upcoming' && start < now.getTime() && !item.fixed) start = now.getTime();

    let end: number;
    if (st?.ended_at) end = new Date(st.ended_at).getTime();
    else if (status === 'live') end = Math.max(start + len, now.getTime());
    else end = start + len;

    cursor = end;
    return {
      ...item,
      status,
      planned_start: new Date(planned),
      est_start: new Date(start),
      est_end: new Date(end),
      delay_minutes: Math.round((start - planned) / MIN),
      results_published: !!st?.published_at,
    };
  });
}

/** The block(s) happening now (live or still being judged) and the next upcoming one. */
export function nowAndNext(live: LiveItem[]): { now: LiveItem[]; next: LiveItem | null } {
  return {
    now: live.filter((i) => i.status === 'live' || i.status === 'judging'),
    next: live.find((i) => i.status === 'upcoming') ?? null,
  };
}

export type ScheduleAction = 'start' | 'close_judging' | 'publish' | 'done' | 'reset';

/**
 * Apply an admin action to a block. Throws on an action that doesn't fit the block's state.
 * Blocks without a division skip judging: Start → Done.
 */
export function applyScheduleAction(item: ScheduleItem, state: ScheduleState | undefined, action: ScheduleAction, now: Date): ScheduleState {
  const s: ScheduleState = state ?? { item_id: item.id, status: 'upcoming', started_at: null, ended_at: null, published_at: null };
  const iso = now.toISOString();
  const judged = !!item.division;
  switch (action) {
    case 'start':
      if (s.status !== 'upcoming') throw new Error(`${item.title} has already started`);
      return { ...s, status: 'live', started_at: iso };
    case 'close_judging':
      if (!judged) throw new Error(`${item.title} isn't judged; use Done`);
      if (s.status !== 'live') throw new Error(`${item.title} isn't live`);
      return { ...s, status: 'judging', ended_at: iso };
    case 'publish':
      if (!judged) throw new Error(`${item.title} has no results to publish`);
      if (s.status !== 'judging' && s.status !== 'live') throw new Error(`Close judging for ${item.title} first`);
      return { ...s, status: 'done', ended_at: s.ended_at ?? iso, published_at: iso };
    case 'done':
      if (s.status === 'upcoming') throw new Error(`${item.title} hasn't started`);
      return { ...s, status: 'done', ended_at: s.ended_at ?? iso };
    case 'reset':
      return { item_id: item.id, status: 'upcoming', started_at: null, ended_at: null, published_at: null };
  }
}

/** Problems with the schedule config (bad times, duplicate ids, unknown divisions). */
export function scheduleIssues(items: ScheduleItem[], divisionCodes: string[], sideEvents: SideEventDef[]): string[] {
  const out: string[] = [];
  const ids = items.map((i) => i.id);
  for (const i of items) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(i.id)) out.push(`schedule item "${i.id}": id must be lowercase letters, numbers or -`);
    if (ids.filter((x) => x === i.id).length > 1) out.push(`duplicate schedule item "${i.id}"`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(i.start)) out.push(`schedule item "${i.id}": start must be HH:MM`);
    if (!(i.minutes > 0 && i.minutes <= 720)) out.push(`schedule item "${i.id}": minutes must be 1–720`);
    if (i.division && !divisionCodes.includes(i.division)) out.push(`schedule item "${i.id}": unknown division "${i.division}"`);
    if (i.round !== undefined && !i.division) out.push(`schedule item "${i.id}": round needs a division`);
  }
  const codes = sideEvents.map((e) => e.code);
  for (const e of sideEvents) {
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(e.code)) out.push(`side event "${e.code}": code must be 1–20 letters, numbers, - or _`);
    if (codes.filter((c) => c === e.code).length > 1) out.push(`duplicate side event "${e.code}"`);
    if (e.timeLimitSeconds !== undefined && (e.kind !== 'counter' || !(e.timeLimitSeconds > 0))) out.push(`side event "${e.code}": timeLimitSeconds is for counters, > 0`);
  }
  return out;
}

// ---------------------------------------------------------------- side events

export interface SideEntry {
  id: string;
  name: string;
  value: number;
  registration_id?: string | null;
  created_at: string;
  hidden?: boolean;
}

export interface SideStanding {
  place: number;
  name: string;
  best: number;
  tries: number;
}

/** Best try per person (by registration, else by name, case-insensitive), ranked; ties share a place. */
export function sideLeaderboard(entries: SideEntry[], better: 'higher' | 'lower'): SideStanding[] {
  const people = new Map<string, { name: string; best: number; tries: number; at: string }>();
  for (const e of entries) {
    if (e.hidden) continue;
    const key = e.registration_id ?? e.name.trim().toLowerCase();
    const cur = people.get(key);
    const isBetter = (v: number, b: number) => (better === 'lower' ? v < b : v > b);
    if (!cur) people.set(key, { name: e.name.trim(), best: e.value, tries: 1, at: e.created_at });
    else {
      cur.tries++;
      // Equal bests keep the earlier try, so whoever set the mark first ranks first in display order.
      if (isBetter(e.value, cur.best)) { cur.best = e.value; cur.at = e.created_at; }
    }
  }
  const rows = [...people.values()].sort((a, b) =>
    (better === 'lower' ? a.best - b.best : b.best - a.best) || a.at.localeCompare(b.at));
  let place = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.best !== rows[i - 1].best) place = i + 1;
    return { place, name: r.name, best: r.best, tries: r.tries };
  });
}

/** "1:05.3" for a timer value in seconds, "142 loops" for a counter. */
export function formatSideValue(value: number, ev: Pick<SideEventDef, 'kind' | 'unit'>): string {
  if (ev.kind === 'timer') {
    const m = Math.floor(value / 60);
    const sec = (value - m * 60).toFixed(1).padStart(4, '0');
    return m > 0 ? `${m}:${sec}` : `${value.toFixed(1)} s`;
  }
  return `${Math.round(value).toLocaleString('en-US')} ${ev.unit}`;
}
