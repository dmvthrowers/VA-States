/**
 * Schedule conflict check (master plan D6): warn when a player is registered in two divisions whose blocks overlap,
 * or follow each other with too little time between. Pure and import-free (type-only), so `npm test` runs it under
 * plain Node. It reads the planned schedule from the config (`dayOf.schedule`), not the live clock.
 */
import type { ScheduleItem } from '@/contest.config';

export interface ConflictPlayer {
  id: string;
  name: string;
  /** Division codes the player is registered in */
  divisions: string[];
}

export type ConflictBlock = Pick<ScheduleItem, 'id' | 'title' | 'start' | 'minutes' | 'division'>;

export interface ScheduleConflict {
  kind: 'overlap' | 'tight';
  a: ConflictBlock;
  b: ConflictBlock;
  /** Minutes the two blocks overlap (overlap), or minutes between them (tight) */
  minutes: number;
  players: { id: string; name: string }[];
}

export const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * Every pair of division blocks that overlap (or, with `gapMinutes`, sit closer than that many minutes apart) and the
 * players registered in both divisions. Pairs with nobody in both are left out. Worst first: overlaps, longest first.
 */
export function scheduleConflicts(blocks: readonly ConflictBlock[], players: readonly ConflictPlayer[], gapMinutes = 0): ScheduleConflict[] {
  const timed = blocks
    .filter((b) => b.division)
    .map((b) => ({ b, start: toMinutes(b.start), end: toMinutes(b.start) + b.minutes }))
    .filter((t) => Number.isFinite(t.start) && Number.isFinite(t.end));
  const out: ScheduleConflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const [x, y] = timed[i].start <= timed[j].start ? [timed[i], timed[j]] : [timed[j], timed[i]];
      if (x.b.division === y.b.division) continue; // two blocks of one division (rounds) never conflict a player with themselves
      const overlap = Math.min(x.end, y.end) - y.start;
      const gap = y.start - x.end;
      const kind = overlap > 0 ? 'overlap' : gap < gapMinutes ? 'tight' : null;
      if (!kind) continue;
      const both = players.filter((p) => p.divisions.includes(x.b.division!) && p.divisions.includes(y.b.division!));
      if (both.length === 0) continue;
      out.push({ kind, a: x.b, b: y.b, minutes: kind === 'overlap' ? overlap : gap, players: both.map((p) => ({ id: p.id, name: p.name })) });
    }
  }
  return out.sort((p, q) => (p.kind === q.kind ? (p.kind === 'overlap' ? q.minutes - p.minutes : p.minutes - q.minutes) : p.kind === 'overlap' ? -1 : 1));
}

/** One plain sentence per conflict, for the panel and for tests. */
export function conflictSentence(c: ScheduleConflict): string {
  const who = c.players.length === 1 ? c.players[0].name : `${c.players.length} players`;
  return c.kind === 'overlap'
    ? `${c.a.title} and ${c.b.title} overlap by ${c.minutes} min. ${who} ${c.players.length === 1 ? 'is' : 'are'} in both.`
    : `Only ${c.minutes} min between ${c.a.title} and ${c.b.title}. ${who} ${c.players.length === 1 ? 'is' : 'are'} in both.`;
}
