import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { isPublished, publishedDivisions } from '@/lib/results-visibility';
import { z } from 'zod';
import { loadPlan } from '@/lib/round-plan-server';
import { isRoundActive } from '@/lib/round-plan';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import {
  betterOf, compareScores, effectiveStyle, freestyleBreakdown, manualBest, manualBreakdown, panelTotal, roundsOf, styleMultiplier,
  type FreestyleSheet, type ScoreBreakdown,
} from '@/lib/divisions-core';

type Division = string;

/**
 * Scoring rules per division come from contest.config.ts → competition.divisions:
 *  - freestyle: clicker tally normalized per judge (×style multiplier) + 4 eval categories − deductions
 *  - panel: one 0–max score per criterion; the total is their sum
 *  - manual: one number per judge (best of N attempts), higher or lower is better
 * Ladder, bracket, showcase and add-on divisions are not scored here (see /api/ladder, /api/bracket).
 * The math lives in lib/divisions-core.ts and mirrors the vsyc_results view.
 */
const sheetNumber = z.number().min(0).max(99).optional().default(0);
const scoreSubmitSchema = z.object({
  registration_id:       z.string().uuid(),
  division:              z.string().trim().max(20).refine((d) => DIVISION_CODES.includes(d), 'Unknown division'),
  /** Which of the competitor's styles this routine was judged under (only needed when they registered several). */
  style_code:            z.string().trim().max(20).optional().nullable(),
  /** Freestyle: raw net clicker tally (+ landed elements, − misses), NOT the normalized score. */
  tech_execution_raw:    z.number().min(-500).max(500).optional().default(0),
  trick_presentation:    sheetNumber,
  performance_quality:   sheetNumber,
  musicality:            sheetNumber,
  routine_construction:  sheetNumber,
  stop_count:            z.number().int().min(0).optional().default(0),
  discard_count:         z.number().int().min(0).optional().default(0),
  detach_count:          z.number().int().min(0).optional().default(0),
  /** Round number (1 = first round). Divisions without rounds only have round 1. */
  round:                 z.number().int().min(1).max(5).optional().default(1),
  /** Manual format: the judge's one score, or leave it out and send manual_attempts. */
  manual_score:          z.number().min(0).max(99999).optional(),
  /** Manual format with attempts: each attempt's number (null = not taken). The best counts. */
  manual_attempts:       z.array(z.number().min(0).max(99999).nullable()).max(10).optional(),
  /** Panel format: criterion key → score */
  panel_scores:          z.record(z.string().max(31), z.number().min(0).max(1000)).optional(),
  notes:                 z.string().trim().max(500).optional(),
}).superRefine((data, ctx) => {
  const d = divisionByCode(data.division);
  if (!d) return;
  const sc = d.scoring;
  const issue = (message: string, path: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
  if (data.round > roundsOf(d).length) issue(`${d.name} has ${roundsOf(d).length} round(s)`, 'round');
  if (sc.format === 'ladder' || sc.format === 'bracket' || sc.format === 'showcase' || sc.format === 'addon') {
    issue(`${d.name} isn't scored on a score sheet`, 'division');
    return;
  }
  if (sc.format === 'manual') {
    const attempts = data.manual_attempts ?? [];
    if (attempts.length > (sc.attempts ?? 1)) issue(`${d.name} allows ${sc.attempts ?? 1} attempt(s)`, 'manual_attempts');
    const best = attempts.length ? manualBest(attempts, sc) : data.manual_score ?? null;
    if (best === null) issue(`${d.name} needs a score`, 'manual_score');
    else if (best > sc.max || [...attempts, data.manual_score].some((v) => typeof v === 'number' && v > sc.max)) issue(`${d.name} is scored out of ${sc.max}`, 'manual_score');
    return;
  }
  if (sc.format === 'panel') {
    const scores = data.panel_scores ?? {};
    for (const c of sc.criteria) {
      if (scores[c.key] === undefined) issue(`Score ${c.label}`, 'panel_scores');
      else if (scores[c.key] > c.max) issue(`${c.label} is scored out of ${c.max}`, 'panel_scores');
    }
    for (const k of Object.keys(scores)) if (!sc.criteria.some((c) => c.key === k)) issue(`Unknown criterion: ${k}`, 'panel_scores');
    return;
  }
  if (!sc.negativeClicks && data.tech_execution_raw < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${d.name} does not use negative clicks`, path: ['tech_execution_raw'] });
  }
  if ([data.trick_presentation, data.performance_quality, data.musicality, data.routine_construction].some((v) => v > sc.evalCap)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Evaluation categories in ${d.name} are scored out of ${sc.evalCap}`, path: ['trick_presentation'] });
  }
  if (data.style_code && !d.styles?.options.some((o) => o.code === data.style_code)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown ${d.name} style`, path: ['style_code'] });
  }
});

interface ScoreRow extends FreestyleSheet {
  division: Division;
  style_code: string | null;
  /** Styles the competitor registered for this division */
  registered_styles: string[];
  manual_score: number | null;
  panel_scores: Record<string, number> | null;
}

const multiplierOf = (r: ScoreRow) =>
  styleMultiplier(divisionByCode(r.division), effectiveStyle(r.style_code, r.registered_styles));

function computeScoreBreakdown(r: ScoreRow, maxRawForJudge: number | null): ScoreBreakdown {
  const d = divisionByCode(r.division);
  if (!d) return { tech_execution_normalized: 0, total_eval: 0, deduction_points: 0, final_score: 0 };
  const sc = d.scoring;
  if (sc.format === 'manual') return manualBreakdown(r.manual_score ?? 0, sc);
  if (sc.format === 'panel') return { tech_execution_normalized: 0, total_eval: 0, deduction_points: 0, final_score: panelTotal(r.panel_scores ?? {}, sc) };
  if (sc.format !== 'freestyle') return { tech_execution_normalized: 0, total_eval: 0, deduction_points: 0, final_score: 0 };
  return freestyleBreakdown(r, sc, multiplierOf(r), maxRawForJudge);
}

/** Highest positive raw Tech Execution (after style multipliers) in this judge's rows, or null. */
function maxPositiveRaw(rows: ScoreRow[]): number | null {
  const positives = rows.filter((r) => r.tech_execution_raw > 0).map((r) => r.tech_execution_raw * multiplierOf(r));
  return positives.length > 0 ? Math.max(...positives) : null;
}

type RegJoin = { division_styles?: Record<string, string[]> | null } | null;
const stylesFor = (reg: RegJoin, division: string): string[] => reg?.division_styles?.[division] ?? [];

function toRow(s: Record<string, unknown>, division: Division, reg: RegJoin): ScoreRow {
  return {
    division,
    style_code: (s.style_code as string | null) ?? null,
    registered_styles: stylesFor(reg, division),
    manual_score: s.manual_score === null || s.manual_score === undefined ? null : Number(s.manual_score),
    panel_scores: (s.panel_scores as Record<string, number> | null) ?? null,
    tech_execution_raw: Number(s.tech_execution_raw),
    trick_presentation: Number(s.trick_presentation),
    performance_quality: Number(s.performance_quality),
    musicality: Number(s.musicality),
    routine_construction: Number(s.routine_construction),
    stop_count: Number(s.stop_count),
    discard_count: Number(s.discard_count),
    detach_count: Number(s.detach_count),
  };
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
  const round = Math.max(1, Number(req.nextUrl.searchParams.get('round') ?? 1) || 1);

  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const div = division as Division;

  const resultsPublished = isPublished(await publishedDivisions(createAdminClient()), division, round);

  if (!mine && !resultsPublished) {
    return NextResponse.json(
      { division, published: false, standings: [] },
      { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45' } }
    );
  }

  let judgeIdentity: { authUserId: string; displayName: string } | null = null;
  if (mine) {
    const token = getBearerToken(req);
    if (!token) {
      return apiError('unauthorized', 'Missing bearer token', requestId);
    }
    const identity = await getStaffIdentityFromToken(token);
    if (!identity || !identity.isActive || !['judge', 'admin'].includes(identity.role)) {
      return apiError('forbidden', 'Judge or admin access required', requestId);
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
      style_code,
      manual_score,
      manual_attempts,
      panel_scores,
      round,
      notes,
      created_at,
      vsyc_registrations (
        first_name,
        last_name,
        preferred_bracket_name,
        city,
        state,
        division_styles
      )
    `)
    .eq('division', division)
    .eq('round', round);

  if (mine && judgeIdentity) {
    query.eq('judge_user_id', judgeIdentity.authUserId);
  }

  const { data: scores, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('[scores] query error:', error);
    return apiError('upstream_error', 'Failed to fetch scores', requestId);
  }

  if (mine) {
    const rows = (scores ?? []).map((s) => {
      const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
      return { s, reg, fields: toRow(s, div, reg) };
    });
    const maxRaw = maxPositiveRaw(rows.map((r) => r.fields));

    const result = rows.map(({ s: raw, reg, fields: s }) => {
      const breakdown = computeScoreBreakdown(s, maxRaw);
      return {
        id: raw.id,
        registration_id: raw.registration_id,
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
        style_code: s.style_code,
        registered_styles: s.registered_styles,
        manual_score: s.manual_score,
        manual_attempts: (raw.manual_attempts as (number | null)[] | null) ?? null,
        panel_scores: s.panel_scores,
        round,
        ...breakdown,
        notes: raw.notes ?? null,
        created_at: raw.created_at,
      };
    });
    return NextResponse.json(
      { division, round, judge: judgeIdentity?.displayName, scores: result },
      { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } }
    );
  }

  // Public aggregated standings — normalize within each judge's own scores first, then average across judges.
  const byJudge = new Map<string, ScoreRow[]>();
  const rowsByJudge = new Map<string, { registration_id: string; display_name: string; city: string | null; state: string | null; fields: ScoreRow }[]>();

  for (const s of scores ?? []) {
    const reg = Array.isArray(s.vsyc_registrations) ? s.vsyc_registrations[0] : s.vsyc_registrations;
    const displayName = reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`;
    const judgeKey = s.judge_user_id ?? `legacy:${s.judge_name}`;

    const fields = toRow(s, div, reg);

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
    .sort((a, b) => compareScores(betterOf(divisionByCode(div)?.scoring))(a.avg_final_score, b.avg_final_score));

  return NextResponse.json(
    { division, round, standings },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45' } }
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
  if (!identity || !identity.isActive || !['judge', 'admin'].includes(identity.role)) {
    return apiError('forbidden', 'Judge or admin access required', requestId);
  }

  const { registration_id, division, notes, round } = parsed.data;
  // A round the confirmed plan skips (e.g. semi-finals in a division under 50) takes no scores.
  const scoredDef = divisionByCode(division)!;
  if (scoredDef.roundPlan?.length) {
    const plan = await loadPlan(createAdminClient(), division);
    if (plan && !isRoundActive(scoredDef, plan, round)) {
      return apiError('unprocessable', `${roundsOf(scoredDef)[round - 1]?.name ?? `Round ${round}`} isn't running for ${scoredDef.name}`, requestId);
    }
  }
  const sc = divisionByCode(division)!.scoring;
  const isManual = sc.format === 'manual';
  // Manual and panel scores keep the freestyle columns at zero.
  const sheet = sc.format !== 'freestyle'
    ? { tech_execution_raw: 0, trick_presentation: 0, performance_quality: 0, musicality: 0, routine_construction: 0, stop_count: 0, discard_count: 0, detach_count: 0 }
    : {
        tech_execution_raw: parsed.data.tech_execution_raw, trick_presentation: parsed.data.trick_presentation,
        performance_quality: parsed.data.performance_quality, musicality: parsed.data.musicality,
        routine_construction: parsed.data.routine_construction, stop_count: parsed.data.stop_count,
        discard_count: parsed.data.discard_count, detach_count: parsed.data.detach_count,
      };
  const manual_attempts = isManual && parsed.data.manual_attempts?.length ? parsed.data.manual_attempts : null;
  const manual_score = isManual
    ? (manual_attempts ? manualBest(manual_attempts, sc) : parsed.data.manual_score ?? null) ?? 0
    : null;
  const panel_scores = sc.format === 'panel' ? parsed.data.panel_scores ?? {} : null;

  const supabase = createAdminClient();

  // Verify registration exists and is in this division
  const { data: reg, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('id, divisions, division_styles, paid')
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
  const registeredStyles = stylesFor(reg as RegJoin, division);
  const style_code = parsed.data.style_code || null;
  if (style_code && !registeredStyles.includes(style_code)) {
    return apiError('unprocessable', 'Competitor did not register that style', requestId);
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
        ...sheet,
        round,
        style_code,
        manual_score,
        manual_attempts,
        panel_scores,
        notes: notes ?? null,
      },
      { onConflict: 'registration_id,division,round,judge_user_id' }
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
    .select('registration_id, tech_execution_raw, trick_presentation, performance_quality, musicality, routine_construction, stop_count, discard_count, detach_count, style_code, manual_score, panel_scores, vsyc_registrations ( division_styles )')
    .eq('division', division)
    .eq('round', round)
    .eq('judge_user_id', identity.authUserId);

  if (judgeScoresError) {
    console.error('[scores] judge baseline query error:', judgeScoresError);
    return apiError('upstream_error', 'Score saved, but failed to compute normalized total', requestId);
  }

  const judgeRows = (judgeScores ?? []).map((r) =>
    toRow(r, division, (Array.isArray(r.vsyc_registrations) ? r.vsyc_registrations[0] : r.vsyc_registrations) as RegJoin));
  const thisRow: ScoreRow = { division, style_code, registered_styles: registeredStyles, manual_score, panel_scores, ...sheet };
  const breakdown = computeScoreBreakdown(thisRow, maxPositiveRaw(judgeRows));

  return NextResponse.json(
    {
      id: score.id,
      judge_name: score.judge_display_name ?? identity.displayName,
      registration_id,
      division,
      ...sheet,
      round,
      style_code,
      manual_score,
      manual_attempts,
      panel_scores,
      ...breakdown,
    },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});
