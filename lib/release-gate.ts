/**
 * Release gates (master plan T2): a round's results go public only when the scores-in board is
 * full AND the head judge has tapped "checked" on the scores as they stand now. Off unless
 * `dayOf.releaseGates` is true in contest.config.ts, so nothing changes until an organizer opts in.
 * Pure, so it is tested without a database.
 */
import type { ScoreStatus } from './score-status';

export interface ReleaseCheck {
  checked_by: string | null;
  checked_at: string;
  /** scoreFingerprint of the scores when the head judge checked them */
  fingerprint: string;
}

/** Changes whenever a score is added, removed or edited, so an edit after "checked" reopens the gate. */
export function scoreFingerprint(status: Pick<ScoreStatus, 'entrants'>): string {
  let count = 0;
  let sum = 0;
  for (const e of status.entrants) {
    for (const s of e.scores) { count += 1; sum += s.score; }
  }
  return `${count}:${Math.round(sum * 100) / 100}`;
}

export interface GateVerdict {
  /** Results may be released */
  open: boolean;
  /** Plain-language reasons the gate is shut; empty when open */
  reasons: string[];
  /** The head judge's check is on file and still matches the scores */
  checked: boolean;
}

export function evaluateReleaseGate(opts: {
  enabled: boolean;
  status: Pick<ScoreStatus, 'entrants' | 'blockers' | 'ready'> | null;
  check: ReleaseCheck | null;
}): GateVerdict {
  const { enabled, status, check } = opts;
  const current = status ? scoreFingerprint(status) : null;
  const checked = !!check && current !== null && check.fingerprint === current;
  if (!enabled) return { open: true, reasons: [], checked };
  const reasons: string[] = [];
  if (!status) reasons.push("This round's scores could not be read.");
  else if (!status.ready) reasons.push(...status.blockers);
  if (status && status.ready) {
    if (!check) reasons.push('The head judge has not checked these scores yet.');
    else if (!checked) reasons.push('Scores changed after the head judge checked them. Check them again.');
  }
  return { open: reasons.length === 0, reasons, checked };
}
