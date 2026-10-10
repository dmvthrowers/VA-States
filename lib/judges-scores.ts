/**
 * Judges' Scores (owner decision, 2026-10-10): the public sheet of every judge's score for every competitor in a
 * released round. Pure, so it is tested without a database. Judges appear as "Judge A, B, C…" unless the contest
 * turns names on (`contest.judgesScores.showJudgeNames`), because a judge did not agree to be named by scoring.
 */

export interface JudgeScoreRow {
  registration_id: string;
  division: string;
  round?: number | null;
  /** Already the public-safe name (the results view applies the minor-privacy rules). */
  display_name: string;
  judge_name?: string | null;
  judge_user_id?: string | null;
  final_score: number | string;
}

export interface JudgeSheetEntry {
  registration_id: string;
  name: string;
  /** One per judge, in the same order as `judges`; null where that judge did not score this competitor. */
  scores: (number | null)[];
  /** Mean of the scores that exist, or null with none. Matches how the standings average judges. */
  average: number | null;
}

export interface JudgeSheet {
  division: string;
  round: number;
  judges: string[];
  /** Best first (highest average when `better` is 'higher'); ties and missing averages by name. */
  entries: JudgeSheetEntry[];
}

export interface JudgeSheetOptions {
  /** Show the judges' own names. Off by default: they appear as Judge A, Judge B, … */
  showNames?: boolean;
  /** Which way is better, as in the standings. Default 'higher'. */
  better?: 'higher' | 'lower';
}

const judgeKey = (r: JudgeScoreRow): string => String(r.judge_user_id ?? r.judge_name ?? '');

const letter = (i: number): string => {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

/** One sheet per division and round that has at least one score, in division then round order. */
export function buildJudgeSheets(
  rows: readonly JudgeScoreRow[],
  optionsFor: (division: string) => JudgeSheetOptions = () => ({}),
): JudgeSheet[] {
  const groups = new Map<string, JudgeScoreRow[]>();
  for (const r of rows) {
    const k = `${r.division}\u0000${r.round ?? 1}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  const sheets: JudgeSheet[] = [];
  for (const [k, group] of groups) {
    const [division, round] = k.split('\u0000');
    const opts = optionsFor(division);
    // Judges in a stable order: by their name, then their id, so the letters never shuffle between loads.
    const byKey = new Map<string, string>();
    for (const r of group) if (!byKey.has(judgeKey(r))) byKey.set(judgeKey(r), String(r.judge_name ?? ''));
    const keys = [...byKey.keys()].sort((a, b) => (byKey.get(a)! < byKey.get(b)! ? -1 : byKey.get(a)! > byKey.get(b)! ? 1 : a < b ? -1 : 1));
    const labels = keys.map((key, i) => (opts.showNames ? byKey.get(key) || `Judge ${letter(i)}` : `Judge ${letter(i)}`));

    const entries = new Map<string, JudgeSheetEntry>();
    for (const r of group) {
      const e = entries.get(r.registration_id)
        ?? entries.set(r.registration_id, { registration_id: r.registration_id, name: r.display_name, scores: keys.map(() => null), average: null }).get(r.registration_id)!;
      const score = Number(r.final_score);
      if (Number.isFinite(score)) e.scores[keys.indexOf(judgeKey(r))] = score;
    }
    for (const e of entries.values()) {
      const have = e.scores.filter((s): s is number => s !== null);
      e.average = have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
    }
    const sign = opts.better === 'lower' ? 1 : -1;
    const sorted = [...entries.values()].sort((a, b) => {
      if (a.average === null && b.average !== null) return 1;
      if (b.average === null && a.average !== null) return -1;
      if (a.average !== null && b.average !== null && a.average !== b.average) return sign * (a.average - b.average);
      return a.name.localeCompare(b.name);
    });
    sheets.push({ division, round: Number(round), judges: labels, entries: sorted });
  }
  return sheets.sort((a, b) => (a.division < b.division ? -1 : a.division > b.division ? 1 : a.round - b.round));
}
