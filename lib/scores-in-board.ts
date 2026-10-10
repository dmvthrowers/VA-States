/**
 * Scores-in board (master plan T1): the run order against the panel as a grid. Each cell says whether
 * that judge's score has landed for that competitor. Pure, built from the /api/admin/score-status
 * payload, so it is tested without a database.
 */
import type { ScoreStatus } from './score-status';

export interface BoardRow {
  registration_id: string;
  name: string;
  run_status: 'upcoming' | 'performing' | 'done';
  /** One entry per judge, in `judges` order: true when that judge's score is in */
  cells: boolean[];
}

export interface ScoresInBoard {
  judges: string[];
  rows: BoardRow[];
  filled: number;
  total: number;
  /** 0–100, whole number */
  percent: number;
  /** True when every cell is filled and there is at least one cell */
  full: boolean;
}

export function buildScoresInBoard(status: Pick<ScoreStatus, 'judges' | 'entrants'>): ScoresInBoard {
  const { judges } = status;
  const rows: BoardRow[] = status.entrants.map((e) => {
    const missing = new Set(e.missing_judges);
    return {
      registration_id: e.registration_id,
      name: e.name,
      run_status: e.run_status,
      cells: judges.map((j) => !missing.has(j)),
    };
  });
  const total = rows.length * judges.length;
  const filled = rows.reduce((n, r) => n + r.cells.filter(Boolean).length, 0);
  return {
    judges,
    rows,
    filled,
    total,
    percent: total === 0 ? 0 : Math.floor((filled / total) * 100),
    full: total > 0 && filled === total,
  };
}

/**
 * What one judge still owes: the competitors who have finished performing and have no score from
 * this judge. Matches by the name the status uses for the judge.
 */
export function owedBy(status: Pick<ScoreStatus, 'entrants'>, judgeName: string): string[] {
  return status.entrants
    .filter((e) => e.run_status === 'done' && e.missing_judges.includes(judgeName))
    .map((e) => e.name);
}

/** "You still owe Ana, Ben and 2 more." or null when nothing is owed. */
export function owedLine(owed: string[]): string | null {
  if (owed.length === 0) return null;
  const shown = owed.slice(0, 3);
  const rest = owed.length - shown.length;
  const head = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
  return rest > 0 ? `You still owe ${shown.join(', ')} and ${rest} more.` : `You still owe ${head}.`;
}
