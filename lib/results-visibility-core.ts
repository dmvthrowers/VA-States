/**
 * Pure rules for which results are public (docs/FORMATS.md → Live schedule). Import-free so
 * `npm test` runs it under plain Node; lib/results-visibility.ts loads the data.
 */

export interface ResultsVisibility {
  /** The global results_published flag: everything is public */
  all: boolean;
  /** Released blocks as `division:round` keys (vsyc_results_releases) */
  released: Set<string>;
}

export const releaseKey = (division: string, round = 1): string => `${division}:${round}`;

/**
 * True when results for `division` (and `round`) are public. With no round, true when any
 * round of the division has been released.
 */
export function isPublished(vis: ResultsVisibility, division: string, round?: number): boolean {
  if (vis.all) return true;
  if (round !== undefined) return vis.released.has(releaseKey(division, round));
  const prefix = `${division}:`;
  for (const key of vis.released) if (key.startsWith(prefix)) return true;
  return false;
}

/** True when anything at all is public. */
export const anyPublished = (vis: ResultsVisibility): boolean => vis.all || vis.released.size > 0;

/** Build a visibility from release rows (handy for tests and the loader). */
export function visibilityFrom(all: boolean, rows: { division: string; round?: number | null }[]): ResultsVisibility {
  return { all, released: new Set(rows.map((r) => releaseKey(r.division, Number(r.round ?? 1) || 1))) };
}
