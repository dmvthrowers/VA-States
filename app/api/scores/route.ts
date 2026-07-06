import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof VALID_DIVISIONS[number];

/** NYYL Tech Execution cap: Sport/SBJ divisions score to /20, 1A/X to /60. */
const TECH_EXECUTION_CAP: Record<Division, number> = { '1A': 60, X: 60, SBJ: 20 };

const scoreSubmitSchema = z.object({
  registration_id:       z.string().uuid(),
  division:              z.enum(['1A', 'X', 'SBJ']),
  /** Raw net clicker tally (+ landed elements, - misses), NOT the final 0-60/0-20 score. Normalized server-side. */
  tech_execution_raw:    z.number().min(-200).max(200),
  trick_presentation:    z.number().min(0).max(10),
  performance_quality:   z.number().min(0).max(10),
  musicality:            z.number().min(0).max(10),
  routine_construction:  z.number().min(0).max(10),
  stop_count:            z.number().int().min(0).optional().default(0),
  discard_count:         z.number().int().min(0).optional().default(0),
  detach_count:          z.number().int().min(0).optional().default(0),
  notes:                 z.string().trim().max(500).optional(),
}).refine(
  (data) => data.division !== 'SBJ' || data.tech_execution_raw >= 0,
  { message: 'Sport/SBJ freestyle does not use negative clicks', path: ['tech_execution_raw'] }
);

interface RawScoreFields {
  division: Division;
  tech_execution_raw: number;
  trick_presentation: number;
  performance_quality: number;
  musicality: number;
  routine_construction: number;
  stop_count: number;
  discard_count: number;
  detach_count: number;
}

interface ScoreBreakdown {
  tech_execution_normalized: number;
  total_eval: number;
  deduction_points: number;
  final_score: number;
}

/**
 * NYYL scoring: Tech Execution is a raw clicker tally, normalized per judge
 * per division — that judge's own highest positive raw score maps to the
 * division cap (60 for 1A/X, 20 for Sport/SBJ), everyone else scales
 * proportionally. SBJ has no major deductions. Final = normalized Tech Exec
 * + the four /10 categories - deduction points, floored at 0.
 * https://yoyocontest.com/freestyle-rules-for-nyyl-events/#technical-execution
 */
function computeScoreBreakdown(s: RawScoreFields, maxRawForJudge: number | null): ScoreBreakdown {
  const cap = TECH_EXECUTION_CAP[s.division];
  const techExecutionNormalized =
    maxRawForJudge === null || s.tech_execution_raw <= 0
      ? 0
      : Math.min(cap, Math.round((s.tech_execution_raw / maxRawForJudge) * cap * 100) / 100);

  const totalEval = Math.round((s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction) * 100) / 100;
  const deductionPoints = s.division === 'SBJ' ? 0 : s.stop_count * 1 + s.discard_count * 3 + s.detach_count * 5;
  const finalScore = Math.max(0, Math.round((techExecutionNormalized + totalEval - deductionPoints) * 100) / 100);

  return { tech_execution_normalized: techExecutionNormalized, total_eval: totalEval, deduction_points: deductionPoints, final_score: finalScore };
}

/** Highest positive raw Tech Execution score across a set of rows (this judge's own baseline), or null if none. */
function maxPositiveRaw(rows: { tech_execution_raw: number }[]): number | null {
  const positives = rows.map((r) => r.tech_execution_raw).filter((v) => v > 0);
  return positives.length > 0 ? Math.max(...positives) : null;
}

/**
 * GET /api/scores?division=1A
 *
 * Public endpoint (default) — returns aggregated standings for a division.
 * Staff endpoint (?mine=1 + Authorization: Bearer <token>) returns this judge's raw scores.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division');
  const mine = req.nextUrl.searchParams.get('mine') === '1';

  if (!division || !VALID_DIVISIONS.includes(division as Division)) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }
  const div = division as Division;

  const resultsPublished = await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true');

  if (!mine && !resultsPublished) {
    return NextResponse.json(
      { division, published: false, standings: [] },
      { headers: { 'x-request-id': requestId } }
    );
  }

  let judgeIdentity: { authUserId: string; displayName: string } | null = null;
  if (mine) {
    const token = getBearerToken(req);
    if (!token) {
      return apiError('unauthorized', 'Missing bearer token', requestId);
    }
    const identity = await getStaffIdentityFromToken(token);
    if (!identity || !identity.isActive || identity.role !== 'judge') {
      return apiError('forbidden', 'Judge access required', requestId);
    }
    judgeIdentity = { authUserId: identity.authUserId, displayName: identity.displayName };
  }

  const supabase = createAdminClient();

  // Fetch scores for this division
  const query = supabase
    .from('vsyc_scores')
    .select(`
      id,
      registration_id,
      division,
      judge_user_id,
      judge_display_name,
      judge_name,
      tech_execution_raw,
      trick_presentation,
      performance_quality,
      musicality,
      routine_construction,
      stop_count,
      discard_count,
      detach_count,
      notes,
      created_at,
      vsyc_registrations (
        first_name,
        last_name,
        preferred_bracket_name,
        city,
        state
      )
    `)
    .eq('division', division);

  if (mine && judgeIdentity) {
    query.eq('judge_user_id', judgeIdentity.authUserId);
  }

  const { data: scores, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('[scores] query error:', error);
    return apiError('upstream_error', 'Failed to fetch scores', requestId);
  }

  if (mine) {
    const rows = (scores ?? []).map((s) => ({
      ...s,
      tech_execution_raw: Number(s.tech_execution_raw),
      trick_presentation: Number(s.trick_presentation),
      performance_quality: Number(s.performance_quality),
      musicality: Number(s.musicality),
      routine_construction: Number(s.routine_construction),
      stop_count: Number(s.stop_count),
      discard_count: Number(s.discard_count),
      detach_count: Number(s.detach_count),
    }));
    const maxRaw = maxPositiveRaw(rows);

    const result = rows.map((s) => {
      const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
      const fields: RawScoreFields = { ...s, division: div };
      const breakdown = computeScoreBreakdown(fields, maxRaw);
      return {
        id: s.id,
        registration_id: s.registration_id,
        display_name: reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
        city: reg?.city ?? null,
        state: reg?.state ?? null,
        tech_execution_raw: s.tech_execution_raw,
        trick_presentation: s.trick_presentation,
        performance_quality: s.performance_quality,
        musicality: s.musicality,
        routine_construction: s.routine_construction,
        stop_count: s.stop_count,
        discard_count: s.discard_count,
        detach_count: s.detach_count,
        ...breakdown,
        notes: s.notes ?? null,
        created_at: s.created_at,
      };
    });
    return NextResponse.json({ division, judge: judgeIdentity?.displayName, scores: result }, { headers: { 'x-request-id': requestId } });
  }

  // Public aggregated standings — normalize within each judge's own scores first, then average across judges.
  const byJudge = new Map<string, RawScoreFields[]>();
  const rowsByJudge = new Map<string, { registration_id: string; display_name: string; city: string | null; state: string | null; fields: RawScoreFields }[]>();

  for (const s of scores ?? []) {
    const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
    const displayName = reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`;
    const judgeKey = s.judge_user_id ?? `legacy:${s.judge_name}`;

    const fields: RawScoreFields = {
      division: div,
      tech_execution_raw: Number(s.tech_execution_raw),
      trick_presentation: Number(s.trick_presentation),
      performance_quality: Number(s.performance_quality),
      musicality: Number(s.musicality),
      routine_construction: Number(s.routine_construction),
      stop_count: Number(s.stop_count),
      discard_count: Number(s.discard_count),
      detach_count: Number(s.detach_count),
    };

    if (!byJudge.has(judgeKey)) byJudge.set(judgeKey, []);
    byJudge.get(judgeKey)!.push(fields);

    if (!rowsByJudge.has(judgeKey)) rowsByJudge.set(judgeKey, []);
    rowsByJudge.get(judgeKey)!.push({ registration_id: s.registration_id, display_name: displayName, city: reg?.city ?? null, state: reg?.state ?? null, fields });
  }

  const byReg = new Map<string, {
    registration_id: string;
    display_name: string;
    city: string | null;
    state: string | null;
    judge_count: number;
    final_score_sum: number;
  }>();

  for (const [judgeKey, rows] of rowsByJudge.entries()) {
    const maxRaw = maxPositiveRaw(byJudge.get(judgeKey)!);
    for (const row of rows) {
      const breakdown = computeScoreBreakdown(row.fields, maxRaw);
      if (!byReg.has(row.registration_id)) {
        byReg.set(row.registration_id, {
          registration_id: row.registration_id,
          display_name: row.display_name,
          city: row.city,
          state: row.state,
          judge_count: 0,
          final_score_sum: 0,
        });
      }
      const entry = byReg.get(row.registration_id)!;
      entry.judge_count += 1;
      entry.final_score_sum += breakdown.final_score;
    }
  }

  const standings = Array.from(byReg.values())
    .map((entry) => ({
      registration_id: entry.registration_id,
      display_name: entry.display_name,
      city: entry.city,
      state: entry.state,
      judge_count: entry.judge_count,
      avg_final_score: Math.round((entry.final_score_sum / entry.judge_count) * 100) / 100,
    }))
    .sort((a, b) => b.avg_final_score - a.avg_final_score);

  return NextResponse.json(
    { division, standings },
    { headers: { 'x-request-id': requestId } }
  );
});

/**
 * POST /api/scores
 *
 * Judge-only score submit/update. Uses authenticated judge identity.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = scoreSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'judge') {
    return apiError('forbidden', 'Judge access required', requestId);
  }

  const {
    registration_id, division, notes,
    tech_execution_raw, trick_presentation, performance_quality, musicality, routine_construction,
    stop_count, discard_count, detach_count,
  } = parsed.data;

  const supabase = createAdminClient();

  // Verify registration exists and is in this division
  const { data: reg, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('id, divisions, paid')
    .eq('id', registration_id)
    .single();

  if (regError || !reg) {
    return apiError('not_found', 'Registration not found', requestId);
  }
  if (!(reg.divisions as string[]).includes(division)) {
    return apiError('unprocessable', 'Competitor is not in this division', requestId);
  }
  if (!reg.paid) {
    return apiError('unprocessable', 'Competitor has not paid', requestId);
  }

  // Upsert score by authenticated judge account.
  const { data: score, error: upsertError } = await supabase
    .from('vsyc_scores')
    .upsert(
      {
        registration_id,
        division,
        judge_user_id: identity.authUserId,
        judge_name: identity.displayName,
        judge_display_name: identity.displayName,
        tech_execution_raw,
        trick_presentation,
        performance_quality,
        musicality,
        routine_construction,
        stop_count,
        discard_count,
        detach_count,
        notes: notes ?? null,
      },
      { onConflict: 'registration_id,division,judge_user_id' }
    )
    .select('id, judge_display_name')
    .single();

  if (upsertError || !score) {
    console.error('[scores] upsert error:', upsertError);
    return apiError('upstream_error', 'Failed to save score', requestId);
  }

  // Tech Execution normalizes against this judge's OWN highest raw score in the
  // division, so re-fetch all of this judge's scores here to get an up-to-date baseline.
  const { data: judgeScores, error: judgeScoresError } = await supabase
    .from('vsyc_scores')
    .select('tech_execution_raw')
    .eq('division', division)
    .eq('judge_user_id', identity.authUserId);

  if (judgeScoresError) {
    console.error('[scores] judge baseline query error:', judgeScoresError);
    return apiError('upstream_error', 'Score saved, but failed to compute normalized total', requestId);
  }

  const maxRaw = maxPositiveRaw((judgeScores ?? []).map((r) => ({ tech_execution_raw: Number(r.tech_execution_raw) })));
  const breakdown = computeScoreBreakdown(
    { division, tech_execution_raw, trick_presentation, performance_quality, musicality, routine_construction, stop_count, discard_count, detach_count },
    maxRaw
  );

  return NextResponse.json(
    {
      id: score.id,
      judge_name: score.judge_display_name ?? identity.displayName,
      registration_id,
      division,
      tech_execution_raw,
      trick_presentation,
      performance_quality,
      musicality,
      routine_construction,
      stop_count,
      discard_count,
      detach_count,
      ...breakdown,
    },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});
