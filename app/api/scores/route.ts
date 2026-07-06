import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;

const scoreSubmitSchema = z.object({
  registration_id: z.string().uuid(),
  division:        z.enum(['1A', 'X', 'SBJ']),
  execution:       z.number().min(0).max(100),
  difficulty:      z.number().min(0).max(100),
  presentation:    z.number().min(0).max(100),
  notes:           z.string().trim().max(500).optional(),
});

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
      execution,
      difficulty,
      presentation,
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
      return {
        id: s.id,
        registration_id: s.registration_id,
        display_name: reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
        city: reg?.city ?? null,
        state: reg?.state ?? null,
        execution: Number(s.execution),
        difficulty: Number(s.difficulty),
        presentation: Number(s.presentation),
        total: Number(s.execution) + Number(s.difficulty) + Number(s.presentation),
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
    execution_sum: number;
    difficulty_sum: number;
    presentation_sum: number;
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
        execution_sum: 0,
        difficulty_sum: 0,
        presentation_sum: 0,
      });
    }
    const entry = byReg.get(s.registration_id)!;
    const judgeKey = s.judge_user_id ?? `legacy:${s.judge_name}`;
    entry.judge_ids.add(judgeKey);
    entry.execution_sum += Number(s.execution);
    entry.difficulty_sum += Number(s.difficulty);
    entry.presentation_sum += Number(s.presentation);
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
      avg_execution: Math.round((entry.execution_sum / judgeCount) * 100) / 100,
      avg_difficulty: Math.round((entry.difficulty_sum / judgeCount) * 100) / 100,
      avg_presentation: Math.round((entry.presentation_sum / judgeCount) * 100) / 100,
      avg_total: Math.round(((entry.execution_sum + entry.difficulty_sum + entry.presentation_sum) / judgeCount) * 100) / 100,
      };
    })
    .sort((a, b) => b.avg_total - a.avg_total);

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

  const { registration_id, division, execution, difficulty, presentation, notes } = parsed.data;

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
        execution,
        difficulty,
        presentation,
        notes: notes ?? null,
      },
      { onConflict: 'registration_id,division,judge_user_id' }
    )
    .select('id, execution, difficulty, presentation, judge_display_name')
    .single();

  if (upsertError || !score) {
    console.error('[scores] upsert error:', upsertError);
    return apiError('upstream_error', 'Failed to save score', requestId);
  }

  return NextResponse.json(
    {
      id: score.id,
      judge_name: score.judge_display_name ?? identity.displayName,
      registration_id,
      division,
      execution: Number(score.execution),
      difficulty: Number(score.difficulty),
      presentation: Number(score.presentation),
      total: Number(score.execution) + Number(score.difficulty) + Number(score.presentation),
    },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});
