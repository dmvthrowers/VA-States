import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb, parseDivisions } from '@/lib/db';
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

function pinIsValid(pin: string): boolean {
  const expected = process.env.JUDGE_PIN;
  return Boolean(expected) && safeCompare(pin, expected as string);
}

interface ScoreRow {
  id: string;
  registration_id: string;
  division: string;
  judge_name: string;
  execution: number;
  difficulty: number;
  presentation: number;
  notes: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  preferred_bracket_name: string | null;
  city: string | null;
  state: string | null;
}

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

  const isJudgeView = Boolean(judgeFilter && pin);
  if (isJudgeView && !pinIsValid(pin as string)) {
    return apiError('unauthorized', 'Invalid PIN', requestId);
  }

  const db = getDb();
  const baseSql = `
    SELECT s.id, s.registration_id, s.division, s.judge_name,
           s.execution, s.difficulty, s.presentation, s.notes, s.created_at,
           r.first_name, r.last_name, r.preferred_bracket_name, r.city, r.state
    FROM vsyc_scores s
    JOIN vsyc_registrations r ON r.id = s.registration_id
    WHERE s.division = ?1`;

  const stmt = isJudgeView
    ? db.prepare(`${baseSql} AND s.judge_name = ?2 ORDER BY s.created_at ASC`).bind(division, judgeFilter)
    : db.prepare(`${baseSql} ORDER BY s.created_at ASC`).bind(division);

  const { results: scores } = await stmt.all<ScoreRow>();

  if (isJudgeView) {
    // Return full raw scores for this judge
    const result = scores.map((s) => ({
      id: s.id,
      registration_id: s.registration_id,
      display_name: s.preferred_bracket_name ?? `${s.first_name} ${s.last_name}`,
      city: s.city ?? null,
      state: s.state ?? null,
      execution: Number(s.execution),
      difficulty: Number(s.difficulty),
      presentation: Number(s.presentation),
      total: Number(s.execution) + Number(s.difficulty) + Number(s.presentation),
      notes: s.notes ?? null,
      created_at: s.created_at,
    }));
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

  for (const s of scores) {
    const displayName = s.preferred_bracket_name ?? `${s.first_name} ${s.last_name}`;

    if (!byReg.has(s.registration_id)) {
      byReg.set(s.registration_id, {
        registration_id: s.registration_id,
        display_name: displayName,
        city: s.city ?? null,
        state: s.state ?? null,
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

  if (!pinIsValid(pin)) {
    return apiError('unauthorized', 'Invalid judge PIN', requestId);
  }

  const db = getDb();

  // Verify registration exists and is in this division
  const reg = await db
    .prepare('SELECT id, divisions, paid FROM vsyc_registrations WHERE id = ?1')
    .bind(registration_id)
    .first<{ id: string; divisions: string; paid: number }>();

  if (!reg) {
    return apiError('not_found', 'Registration not found', requestId);
  }
  if (!parseDivisions(reg.divisions).includes(division)) {
    return apiError('unprocessable', 'Competitor is not in this division', requestId);
  }
  if (!reg.paid) {
    return apiError('unprocessable', 'Competitor has not paid', requestId);
  }

  // Upsert score
  const score = await db
    .prepare(
      `INSERT INTO vsyc_scores (id, registration_id, division, judge_name, execution, difficulty, presentation, notes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (registration_id, division, judge_name) DO UPDATE SET
         execution = excluded.execution,
         difficulty = excluded.difficulty,
         presentation = excluded.presentation,
         notes = excluded.notes
       RETURNING id, execution, difficulty, presentation`
    )
    .bind(crypto.randomUUID(), registration_id, division, judge_name, execution, difficulty, presentation, notes ?? null)
    .first<{ id: string; execution: number; difficulty: number; presentation: number }>();

  if (!score) {
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
