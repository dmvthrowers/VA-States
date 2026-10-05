/**
 * Pure shaping for GET /api/schedule (docs/FORMATS.md → Live schedule): LiveItem → JSON, and
 * the "On stage / On deck" snapshot of a run order. Type-only imports, so `npm test` runs it.
 */
import type { LiveItem, ScheduleStatus } from './schedule-core';

export interface FeedItem {
  id: string;
  title: string;
  /** Planned "HH:MM" from contest.config.ts */
  start: string;
  minutes: number;
  division: string | null;
  round: number | null;
  kind: string | null;
  fixed: boolean;
  note: string | null;
  status: ScheduleStatus;
  planned_start: string;
  est_start: string;
  est_end: string;
  delay_minutes: number;
  /** This block's Publish results was pressed */
  results_published: boolean;
  /** Where the public can see this block's results, once they're out (global flag or release) */
  results_url: string | null;
}

export interface StagePerformer {
  position: number;
  display_name: string;
  style: string | null;
}

export interface RunOrderSnapshot {
  division: string;
  round: number;
  /** The row with status 'performing' */
  performing: StagePerformer | null;
  /** The next two 'upcoming' rows by position */
  on_deck: StagePerformer[];
  done: number;
  total: number;
}

export interface FeedNowItem extends FeedItem {
  /** Live run order for a judged block; null when none has been set */
  run_order: RunOrderSnapshot | null;
}

export interface ScheduleFeed {
  timeZone: string;
  /** Server clock, ISO */
  now: string;
  items: FeedItem[];
  now_items: FeedNowItem[];
  next: FeedItem | null;
}

export function feedItem(i: LiveItem, resultsOut: boolean): FeedItem {
  return {
    id: i.id,
    title: i.title,
    start: i.start,
    minutes: i.minutes,
    division: i.division ?? null,
    round: i.division ? (i.round ?? 1) : null,
    kind: i.kind ?? null,
    fixed: !!i.fixed,
    note: i.note ?? null,
    status: i.status,
    planned_start: i.planned_start.toISOString(),
    est_start: i.est_start.toISOString(),
    est_end: i.est_end.toISOString(),
    delay_minutes: i.delay_minutes,
    results_published: i.results_published,
    results_url: i.division && resultsOut ? `/results#div-${encodeURIComponent(i.division)}` : null,
  };
}

/** One run order row with its (already privacy-safe) public name. */
export interface RunOrderNameRow {
  position: number;
  status: string;
  display_name: string;
  style?: string | null;
}

export const ON_DECK = 2;

/** Who's on stage, who's on deck, and how far through the round we are. */
export function runOrderSnapshot(division: string, round: number, rows: RunOrderNameRow[]): RunOrderSnapshot {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const pick = (r: RunOrderNameRow): StagePerformer => ({ position: r.position, display_name: r.display_name, style: r.style ?? null });
  const performing = sorted.find((r) => r.status === 'performing');
  return {
    division,
    round,
    performing: performing ? pick(performing) : null,
    on_deck: sorted.filter((r) => r.status === 'upcoming').slice(0, ON_DECK).map(pick),
    done: sorted.filter((r) => r.status === 'done').length,
    total: sorted.length,
  };
}
