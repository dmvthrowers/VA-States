import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { safeCompare } from '@/lib/tokens';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;

const scoreSubmitSchema = z.object({
  pin:             z.string().min(1),
  judge_name:      z.string().trim().min(1).max(100),
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
 * Public endpoint — returns aggregated scores for a division.
 * Strips judge_name from the public view; averages across all judges.
 *
 * For the judge portal's own view: add ?judge=JudgeName&pin=XXXX to see raw scores.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division');
  const judgeFilter = req.nextUrl.searchParams.get('judge');
  const pin = req.nextUrl.searchParams.get('pin');

  if (!division || !VALID_DIVISIONS.includes(division as typeof VALID_DIVISIONS[number])) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

  const supabase = createAdminClient();

  // If requesting judge-specific scores with PIN, validate pin
  const isJudgeView = judgeFilter && pin;
  if (isJudgeView) {
    // Rate limit PIN attempts — 60 per IP per 15 minutes (brute-force guard)
    const ip = getClientIp(req.headers);
    const allowed = await checkRateLimit(ip, 'judge-pin', 60, 15);
    if (!allowed) {
      return apiError('rate_limited', 'Too many PIN attempts. Try again later.', requestId, {
        'Retry-After': '900',
      });
    }
    const expectedPin = process.env.JUDGE_PIN;
    if (!expectedPin || !safeCompare(pin, expectedPin)) {
      return apiError('unauthorized', 'Invalid PIN', requestId);
    }
  }

  // Fetch scores for this division
  const query = supabase
    .from('vsyc_scores')
    .select(`
      id,
      registration_id,
      division,
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

  if (isJudgeView) {
    query.eq('judge_name', judgeFilter);
  }

  const { data: scores, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('[scores] query error:', error);
    return apiError('upstream_error', 'Failed to fetch scores', requestId);
  }

  if (isJudgeView) {
    // Return full raw scores for this judge
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
    return NextResponse.json({ division, scores: result }, { headers: { 'x-request-id': requestId } });
  }

  // Public aggregated view — average by registration_id, sorted by average total desc
  const byReg = new Map<string, {
    registration_id: string;
    display_name: string;
    city: string | null;
    state: string | null;
    judge_count: number;
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
        judge_count: 0,
        execution_sum: 0,
        difficulty_sum: 0,
        presentation_sum: 0,
      });
    }
    const entry = byReg.get(s.registration_id)!;
    entry.judge_count += 1;
    entry.execution_sum += Number(s.execution);
    entry.difficulty_sum += Number(s.difficulty);
    entry.presentation_sum += Number(s.presentation);
  }

  const standings = Array.from(byReg.values())
    .map((entry) => ({
      registration_id: entry.registration_id,
      display_name: entry.display_name,
      city: entry.city,
      state: entry.state,
      judge_count: entry.judge_count,
      avg_execution: Math.round((entry.execution_sum / entry.judge_count) * 100) / 100,
      avg_difficulty: Math.round((entry.difficulty_sum / entry.judge_count) * 100) / 100,
      avg_presentation: Math.round((entry.presentation_sum / entry.judge_count) * 100) / 100,
      avg_total: Math.round(((entry.execution_sum + entry.difficulty_sum + entry.presentation_sum) / entry.judge_count) * 100) / 100,
    }))
    .sort((a, b) => b.avg_total - a.avg_total);

  return NextResponse.json(
    { division, standings },
    { headers: { 'x-request-id': requestId } }
  );
});

/**
 * POST /api/scores
 *
 * Submit or update a score. PIN-gated. Upserts by (registration_id, division, judge_name).
 *
 * Body: { pin, judge_name, registration_id, division, execution, difficulty, presentation, notes? }
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

  const { pin, judge_name, registration_id, division, execution, difficulty, presentation, notes } = parsed.data;

  // Rate limit PIN attempts — 60 per IP per 15 minutes (brute-force guard)
  const ip = getClientIp(req.headers);
  const pinAllowed = await checkRateLimit(ip, 'judge-pin', 60, 15);
  if (!pinAllowed) {
    return apiError('rate_limited', 'Too many PIN attempts. Try again later.', requestId, {
      'Retry-After': '900',
    });
  }

  // PIN validation (constant-time)
  const expectedPin = process.env.JUDGE_PIN;
  if (!expectedPin || !safeCompare(pin, expectedPin)) {
    return apiError('unauthorized', 'Invalid judge PIN', requestId);
  }

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

  // Upsert score
  const { data: score, error: upsertError } = await supabase
    .from('vsyc_scores')
    .upsert(
      { registration_id, division, judge_name, execution, difficulty, presentation, notes: notes ?? null },
      { onConflict: 'registration_id,division,judge_name' }
    )
    .select('id, execution, difficulty, presentation')
    .single();

  if (upsertError || !score) {
    console.error('[scores] upsert error:', upsertError);
    return apiError('upstream_error', 'Failed to save score', requestId);
  }

  return NextResponse.json(
    {
      id: score.id,
      judge_name,
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
