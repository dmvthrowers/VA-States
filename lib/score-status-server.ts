import type { SupabaseClient } from '@supabase/supabase-js';
import { divisionByCode } from '@/contest.config';
import { runOrderDisplayName } from '@/lib/display-name';
import { computeScoreStatus, type ScoreStatus } from '@/lib/score-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;

export type LoadedScoreStatus =
  | { ok: true; status: ScoreStatus }
  | { ok: false; reason: 'not_scored' | 'upstream' };

/**
 * Loads one round's run order and scores and computes its status. Shared by /api/admin/score-status
 * and the release gate, so both read the same numbers. The caller has already checked that the
 * division and round exist.
 */
export async function loadScoreStatus(db: AnyClient, division: string, round: number): Promise<LoadedScoreStatus> {
  const def = divisionByCode(division);
  if (!def) return { ok: false, reason: 'not_scored' };
  const s = def.scoring;
  if (!['freestyle', 'panel', 'manual'].includes(s.format)) return { ok: false, reason: 'not_scored' };
  // The top score of the sheet, for the outlier check.
  const scale = s.format === 'freestyle' ? s.techCap + 4 * s.evalCap
    : s.format === 'panel' ? s.criteria.reduce((n, c) => n + c.max, 0)
    : s.format === 'manual' ? s.max : null;

  const [runRes, scoreRes] = await Promise.all([
    db.from('vsyc_run_order')
      .select('registration_id, status, position, vsyc_registrations (first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public)')
      .eq('division', division).eq('round', round).order('position', { ascending: true }),
    db.from('vsyc_results')
      .select('registration_id, judge_name, judge_user_id, final_score')
      .eq('division', division).eq('round', round),
  ]);
  if (runRes.error || scoreRes.error) {
    console.error('[score-status] query error:', runRes.error ?? scoreRes.error);
    return { ok: false, reason: 'upstream' };
  }

  type RegName = Parameters<typeof runOrderDisplayName>[0];
  const entrants = (runRes.data ?? []).map((r) => {
    const reg = (Array.isArray(r.vsyc_registrations) ? r.vsyc_registrations[0] : r.vsyc_registrations) as RegName | null;
    return {
      registration_id: r.registration_id as string,
      name: reg ? runOrderDisplayName(reg, true) : 'Unnamed competitor',
      run_status: r.status as 'upcoming' | 'performing' | 'done',
    };
  });
  const scores = (scoreRes.data ?? []).map((r) => ({
    registration_id: r.registration_id as string,
    judge_key: String(r.judge_user_id ?? r.judge_name),
    judge_name: String(r.judge_name),
    score: Number(r.final_score),
  }));
  return { ok: true, status: computeScoreStatus(entrants, scores, { scale }) };
}
