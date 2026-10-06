/**
 * Live score status for one division and round (site issue #83): who has scored whom, what's
 * missing, scores far from the other judges, and a "ready to publish" verdict. Pure, so it's tested
 * without a database; the route that feeds it is /api/admin/score-status.
 *
 * Who counts as an expected judge: anyone who has scored at least one entrant in this round. The app
 * has no per-round judge roster, so a judge who scored nobody is treated as not judging this round.
 */

export interface StatusEntrant {
  registration_id: string;
  name: string;
  /** Where they are in the run order: only 'done' performers are expected to be fully scored */
  run_status: 'upcoming' | 'performing' | 'done';
}

export interface StatusScore {
  registration_id: string;
  judge_key: string;
  judge_name: string;
  score: number;
}

export interface EntrantStatus {
  registration_id: string;
  name: string;
  run_status: StatusEntrant['run_status'];
  scores: { judge_name: string; score: number }[];
  missing_judges: string[];
  median: number | null;
  /** Highest minus lowest score */
  spread: number | null;
  outliers: { judge_name: string; score: number; median: number; diff: number }[];
}

export interface ScoreStatus {
  judges: string[];
  entrants: EntrantStatus[];
  /** Entrants fully scored by every judge */
  complete: number;
  /** Things that should stop a publish */
  blockers: string[];
  /** Worth a look, but don't stop a publish */
  warnings: string[];
  ready: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface StatusOptions {
  /** The top score of the sheet (e.g. 100). With it, a score more than `outlierShare` of it from the median of the judges' scores is flagged. Without it, no outliers. */
  scale?: number | null;
  /** Default 0.15: 15 points on a 100-point sheet */
  outlierShare?: number;
}

export function computeScoreStatus(entrants: StatusEntrant[], scores: StatusScore[], opts: StatusOptions = {}): ScoreStatus {
  const judgeNames = new Map<string, string>(); // key -> name
  for (const s of scores) if (!judgeNames.has(s.judge_key)) judgeNames.set(s.judge_key, s.judge_name);
  const judges = [...judgeNames.values()].sort((a, b) => a.localeCompare(b));

  const byEntrant = new Map<string, StatusScore[]>();
  for (const s of scores) byEntrant.set(s.registration_id, [...(byEntrant.get(s.registration_id) ?? []), s]);

  const delta = (opts.scale ?? 0) * (opts.outlierShare ?? 0.15);
  const known = new Set(entrants.map((e) => e.registration_id));
  const rows: EntrantStatus[] = entrants.map((e) => {
    const mine = byEntrant.get(e.registration_id) ?? [];
    const have = new Set(mine.map((s) => s.judge_key));
    const missing = [...judgeNames.entries()].filter(([k]) => !have.has(k)).map(([, n]) => n).sort((a, b) => a.localeCompare(b));
    const outliers: EntrantStatus['outliers'] = [];
    if (delta > 0 && mine.length >= 3) {
      // Against the median of everyone's scores: one wild score can't drag the median it's judged by.
      const m = median(mine.map((x) => x.score))!;
      for (const s of mine) {
        if (Math.abs(s.score - m) > delta) outliers.push({ judge_name: s.judge_name, score: round2(s.score), median: round2(m), diff: round2(s.score - m) });
      }
    }
    const nums = mine.map((s) => s.score);
    return {
      registration_id: e.registration_id,
      name: e.name,
      run_status: e.run_status,
      scores: mine.map((s) => ({ judge_name: s.judge_name, score: round2(s.score) })).sort((a, b) => a.judge_name.localeCompare(b.judge_name)),
      missing_judges: missing,
      median: median(nums) === null ? null : round2(median(nums)!),
      spread: nums.length ? round2(Math.max(...nums) - Math.min(...nums)) : null,
      outliers,
    };
  });

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (entrants.length === 0) blockers.push('No run order is set for this round, so there is no list of who should be scored.');
  if (scores.length === 0) blockers.push('No scores have been entered yet.');
  const notPerformed = rows.filter((r) => r.run_status !== 'done');
  if (notPerformed.length) blockers.push(`${notPerformed.length} ${notPerformed.length === 1 ? 'competitor has' : 'competitors have'} not finished performing: ${list(notPerformed.map((r) => r.name))}.`);
  const unscored = rows.filter((r) => r.run_status === 'done' && r.scores.length === 0);
  if (unscored.length) blockers.push(`No scores for ${list(unscored.map((r) => r.name))}.`);
  const partial = rows.filter((r) => r.scores.length > 0 && r.missing_judges.length > 0);
  for (const r of partial) blockers.push(`${r.name} is missing ${list(r.missing_judges)}.`);

  const stray = [...byEntrant.keys()].filter((id) => !known.has(id));
  if (stray.length && entrants.length) warnings.push(`${stray.length} scored ${stray.length === 1 ? 'competitor is' : 'competitors are'} not in this round's run order.`);
  if (judges.length === 1 && scores.length) warnings.push(`Only one judge has scored (${judges[0]}), so scores can't be compared.`);
  for (const r of rows) {
    for (const o of r.outliers) warnings.push(`${o.judge_name} gave ${r.name} ${o.score}, ${Math.abs(o.diff)} ${o.diff > 0 ? 'above' : 'below'} the judges' median (${o.median}).`);
  }

  const complete = rows.filter((r) => r.scores.length > 0 && r.missing_judges.length === 0).length;
  return { judges, entrants: rows, complete, blockers, warnings, ready: blockers.length === 0 };
}

function list(names: string[]): string {
  const shown = names.slice(0, 4).join(', ');
  return names.length > 4 ? `${shown} and ${names.length - 4} more` : shown;
}
