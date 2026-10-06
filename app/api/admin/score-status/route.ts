import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { runOrderDisplayName } from '@/lib/display-name';
import { computeScoreStatus } from '@/lib/score-status';

/**
 * GET /api/admin/score-status?division=<code>&round=<n>   (admin or judge)
 *
 * Live status of one round's judging (site issue #83): per competitor, who has scored them and who
 * hasn't, the median and spread, and scores far from the judges' median; plus a "ready to publish"
 * verdict with the blockers and warnings behind it. Read-only. Staff see full names, so it's never cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity?.isActive || !['admin', 'judge'].includes(identity.role)) {
    return apiError('forbidden', 'Admin or judge access required', requestId);
  }

  const division = req.nextUrl.searchParams.get('division');
  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const def = divisionByCode(division)!;
  const roundParam = req.nextUrl.searchParams.get('round');
  const round = roundParam === null || roundParam === '' ? 1 : Number(roundParam);
  if (!Number.isInteger(round) || round < 1 || round > roundsOf(def).length) {
    return apiError('bad_request', `round must be 1–${roundsOf(def).length} for ${division}`, requestId);
  }
  const s = def.scoring;
  if (!['freestyle', 'panel', 'manual'].includes(s.format)) {
    return apiError('bad_request', `${def.name} isn't scored on a score sheet`, requestId);
  }
  // The top score of the sheet, for the outlier check.
  const scale = s.format === 'freestyle' ? s.techCap + 4 * s.evalCap
    : s.format === 'panel' ? s.criteria.reduce((n, c) => n + c.max, 0)
    : s.format === 'manual' ? s.max : null;

  const db = createAdminClient();
  const [runRes, scoreRes] = await Promise.all([
    db.from('vsyc_run_order')
      .select('registration_id, status, position, vsyc_registrations (first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public)')
      .eq('division', division).eq('round', round).order('position', { ascending: true }),
    db.from('vsyc_results')
      .select('registration_id, judge_name, judge_user_id, final_score')
      .eq('division', division).eq('round', round),
  ]);
  if (runRes.error || scoreRes.error) {
    console.error('[admin/score-status] query error:', runRes.error ?? scoreRes.error);
    return apiError('upstream_error', 'Failed to load the scores', requestId);
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

  const status = computeScoreStatus(entrants, scores, { scale });
  return NextResponse.json(
    { division, round, round_name: roundsOf(def)[round - 1].name, ...status },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
