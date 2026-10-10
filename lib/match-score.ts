/**
 * Bracket match scores (master plan F1): a match is won by the first side to reach a target, e.g.
 * `matchScoring: { to: 3, finalsTo: 5 }` for kendama trick-deck battles. Pure and import-free so the
 * route, the admin panel and the tests share one rule.
 */

export interface MatchScoring {
  /** First to this many wins a match */
  to: number;
  /** First to this many wins the final (default: same as `to`) */
  finalsTo?: number;
}

/** What a match is played to. The third-place match plays to `to`, not `finalsTo`. */
export function matchTarget(ms: MatchScoring, isFinal: boolean): number {
  return isFinal && ms.finalsTo !== undefined ? ms.finalsTo : ms.to;
}

export type ScoreState = 'empty' | 'in_progress' | 'decided' | 'invalid';

export interface ScoreOutcome {
  state: ScoreState;
  /** Which side won, once decided */
  winner: 'a' | 'b' | null;
  /** Plain words for the admin screen; empty when there is nothing to say */
  message: string;
}

/**
 * Rules: scores are whole numbers from 0. The first side to reach `target` wins and play stops, so
 * nobody can go past it and both can't reach it. Anything else is still in progress.
 */
export function evaluateMatchScore(a: number | null, b: number | null, target: number): ScoreOutcome {
  if (a === null && b === null) return { state: 'empty', winner: null, message: '' };
  const x = a ?? 0, y = b ?? 0;
  if (![x, y].every((n) => Number.isInteger(n) && n >= 0)) return { state: 'invalid', winner: null, message: 'Scores are whole numbers from 0.' };
  if (x > target || y > target) return { state: 'invalid', winner: null, message: `Play stops at ${target}. A score can't go above it.` };
  if (x === target && y === target) return { state: 'invalid', winner: null, message: `Only one side can reach ${target}.` };
  if (x === target) return { state: 'decided', winner: 'a', message: '' };
  if (y === target) return { state: 'decided', winner: 'b', message: '' };
  return { state: 'in_progress', winner: null, message: `First to ${target} wins.` };
}

/** "First to 3, finals first to 5" */
export function matchScoringLabel(ms: MatchScoring): string {
  return ms.finalsTo !== undefined && ms.finalsTo !== ms.to ? `First to ${ms.to}, final first to ${ms.finalsTo}` : `First to ${ms.to}`;
}
