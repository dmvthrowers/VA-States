/**
 * Code of conduct versions (master plan P1). Each registration, spectator and volunteer stores the
 * version they accepted; after the organizer revises the code and bumps `contest.codeOfConductVersion`,
 * these helpers say who is still on an old one. Pure, so it is tested without a database.
 */

export type ConductStatus = 'current' | 'outdated' | 'unrecorded';

/** `unrecorded` is anyone who signed up before versions were stored. */
export function conductStatus(accepted: string | null | undefined, current: string): ConductStatus {
  if (accepted === null || accepted === undefined || accepted === '') return 'unrecorded';
  return accepted === current ? 'current' : 'outdated';
}

export interface ConductSummary {
  current: number;
  outdated: number;
  unrecorded: number;
  total: number;
  /** Versions seen, with how many people accepted each (newest-looking last when sorted as text) */
  byVersion: Record<string, number>;
}

export function summarizeConduct(accepted: (string | null | undefined)[], current: string): ConductSummary {
  const out: ConductSummary = { current: 0, outdated: 0, unrecorded: 0, total: accepted.length, byVersion: {} };
  for (const v of accepted) {
    out[conductStatus(v, current)] += 1;
    if (v) out.byVersion[v] = (out.byVersion[v] ?? 0) + 1;
  }
  return out;
}
