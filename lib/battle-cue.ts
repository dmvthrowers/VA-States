/**
 * Which battle the DJ should cue: the match that's live, else the next one with two entrants and
 * no winner yet. Pure, so it's tested without a database. Types only from ./bracket-store.
 */
import type { MatchStatus } from './bracket-store';

export interface CueMatch {
  id: string;
  round: number;
  position: number;
  is_third_place: boolean;
  entry_a: string | null;
  entry_b: string | null;
  winner: string | null;
  status: MatchStatus;
}

/** Play order for a bracket: round by round, with the third-place match just before the final. */
export function cueOrder<T extends CueMatch>(matches: T[]): T[] {
  const main = matches.filter((m) => !m.is_third_place);
  const finalRound = main.length ? Math.max(...main.map((m) => m.round)) : 0;
  // Third place sorts at finalRound*10 - 5: after the semifinals, before the final.
  const rank = (m: CueMatch) => (m.is_third_place ? finalRound * 10 - 5 : m.round * 10);
  return [...matches].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

/** A match that can be played: two entrants and no winner. Byes are decided already. */
export const isPlayable = (m: CueMatch) => !!m.entry_a && !!m.entry_b && m.winner === null;

/** The live match, else the first playable one in play order, else null (the bracket is finished or not drawn). */
export function battleCue<T extends CueMatch>(matches: T[]): T | null {
  const ordered = cueOrder(matches);
  return ordered.find((m) => m.status === 'live' && isPlayable(m)) ?? ordered.find(isPlayable) ?? null;
}
