import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;

const scoreSubmitSchema = z.object({
  registration_id:       z.string().uuid(),
  division:              z.enum(['1A', 'X', 'SBJ']),
  tech_execution:        z.number().min(0).max(60),
  trick_presentation:    z.number().min(0).max(10),
  performance_quality:   z.number().min(0).max(10),
  musicality:            z.number().min(0).max(10),
  routine_construction:  z.number().min(0).max(10),
  deduction_stop:        z.number().min(0).optional().default(0),
  deduction_discard:     z.number().min(0).optional().default(0),
  deduction_cut:         z.number().min(0).optional().default(0),
  notes:                 z.string().trim().max(500).optional(),
});

/** NYYL final score: (Tech Execution + Total Eval) - deductions, floored at 0. */
function computeFinalScore(s: {
  tech_execution: number;
  trick_presentation: number;
  performance_quality: number;
  musicality: number;
  routine_construction: number;
  deduction_stop: number;
  deduction_discard: number;
  deduction_cut: number;
}): number {
  const subtotal = s.tech_execution + s.trick_presentation + s.performance_quality + s.musicality + s.routine_construction;
  const final = subtotal - s.deduction_stop - s.deduction_discard - s.deduction_cut;
  return Math.max(0, Math.round(final * 100) / 100);
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

  if (!division || !VALID_DIVISIONS.includes(division as typeof VALID_DIVISIONS[number])) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

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
      tech_execution,
      trick_presentation,
      performance_quality,
      musicality,
      routine_construction,
      deduction_stop,
      deduction_discard,
      deduction_cut,
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
    const result = (scores ?? []).map((s) => {
      const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
      const parsed = {
        tech_execution: Number(s.tech_execution),
        trick_presentation: Number(s.trick_presentation),
        performance_quality: Number(s.performance_quality),
        musicality: Number(s.musicality),
        routine_construction: Number(s.routine_construction),
        deduction_stop: Number(s.deduction_stop),
        deduction_discard: Number(s.deduction_discard),
        deduction_cut: Number(s.deduction_cut),
      };
      return {
        id: s.id,
        registration_id: s.registration_id,
        display_name: reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
        city: reg?.city ?? null,
        state: reg?.state ?? null,
        ...parsed,
        final_score: computeFinalScore(parsed),
        notes: s.notes ?? null,
        created_at: s.created_at,
      };
    });
    return NextResponse.json({ division, judge: judgeIdentity?.displayName, scores: result }, { headers: { 'x-request-id': requestId } });
  }

  // Public aggregated standings — average by competitor.
  const byReg = new Map<string, {
    registration_id: string;
    display_name: string;
    city: string | null;
    state: string | null;
    judge_ids: Set<string>;
    tech_execution_sum: number;
    trick_presentation_sum: number;
    performance_quality_sum: number;
    musicality_sum: number;
    routine_construction_sum: number;
    deduction_sum: number;
    final_score_sum: number;
  }>();

  for (const s of scores ?? []) {
    const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
    const displayName = reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`;

    if (!byReg.has(s.registration_id)) {
      byReg.set(s.registration_id, {
        registration_id: s.registration_id,
        display_name: displayName,
        city: reg?.city ?? null,
        state: reg?.state ?? null,
        judge_ids: new Set<string>(),
        tech_execution_sum: 0,
        trick_presentation_sum: 0,
        performance_quality_sum: 0,
        musicality_sum: 0,
        routine_construction_sum: 0,
        deduction_sum: 0,
        final_score_sum: 0,
      });
    }
    const entry = byReg.get(s.registration_id)!;
    const judgeKey = s.judge_user_id ?? `legacy:${s.judge_name}`;
    entry.judge_ids.add(judgeKey);
    const parsed = {
      tech_execution: Number(s.tech_execution),
      trick_presentation: Number(s.trick_presentation),
      performance_quality: Number(s.performance_quality),
      musicality: Number(s.musicality),
      routine_construction: Number(s.routine_construction),
      deduction_stop: Number(s.deduction_stop),
      deduction_discard: Number(s.deduction_discard),
      deduction_cut: Number(s.deduction_cut),
    };
    entry.tech_execution_sum += parsed.tech_execution;
    entry.trick_presentation_sum += parsed.trick_presentation;
    entry.performance_quality_sum += parsed.performance_quality;
    entry.musicality_sum += parsed.musicality;
    entry.routine_construction_sum += parsed.routine_construction;
    entry.deduction_sum += parsed.deduction_stop + parsed.deduction_discard + parsed.deduction_cut;
    entry.final_score_sum += computeFinalScore(parsed);
  }

  const standings = Array.from(byReg.values())
    .map((entry) => {
      const judgeCount = entry.judge_ids.size || 1;
      return {
        registration_id: entry.registration_id,
        display_name: entry.display_name,
        city: entry.city,
        state: entry.state,
        judge_count: judgeCount,
        avg_tech_execution: Math.round((entry.tech_execution_sum / judgeCount) * 100) / 100,
        avg_trick_presentation: Math.round((entry.trick_presentation_sum / judgeCount) * 100) / 100,
        avg_performance_quality: Math.round((entry.performance_quality_sum / judgeCount) * 100) / 100,
        avg_musicality: Math.round((entry.musicality_sum / judgeCount) * 100) / 100,
        avg_routine_construction: Math.round((entry.routine_construction_sum / judgeCount) * 100) / 100,
        avg_deductions: Math.round((entry.deduction_sum / judgeCount) * 100) / 100,
        avg_final_score: Math.round((entry.final_score_sum / judgeCount) * 100) / 100,
      };
    })
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
    tech_execution, trick_presentation, performance_quality, musicality, routine_construction,
    deduction_stop, deduction_discard, deduction_cut,
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
        tech_execution,
        trick_presentation,
        performance_quality,
        musicality,
        routine_construction,
        deduction_stop,
        deduction_discard,
        deduction_cut,
        notes: notes ?? null,
      },
      { onConflict: 'registration_id,division,judge_user_id' }
    )
    .select(`
      id, judge_display_name,
      tech_execution, trick_presentation, performance_quality, musicality, routine_construction,
      deduction_stop, deduction_discard, deduction_cut
    `)
    .single();

  if (upsertError || !score) {
    console.error('[scores] upsert error:', upsertError);
    return apiError('upstream_error', 'Failed to save score', requestId);
  }

  const saved = {
    tech_execution: Number(score.tech_execution),
    trick_presentation: Number(score.trick_presentation),
    performance_quality: Number(score.performance_quality),
    musicality: Number(score.musicality),
    routine_construction: Number(score.routine_construction),
    deduction_stop: Number(score.deduction_stop),
    deduction_discard: Number(score.deduction_discard),
    deduction_cut: Number(score.deduction_cut),
  };

  return NextResponse.json(
    {
      id: score.id,
      judge_name: score.judge_display_name ?? identity.displayName,
      registration_id,
      division,
      ...saved,
      subtotal: Math.round((saved.tech_execution + saved.trick_presentation + saved.performance_quality + saved.musicality + saved.routine_construction) * 100) / 100,
      final_score: computeFinalScore(saved),
    },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});
