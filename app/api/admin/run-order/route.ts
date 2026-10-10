import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { z } from 'zod';
import { DIVISION_CODES, dayOf, divisionByCode } from '@/contest.config';
import { checkDrawMeta } from '@/lib/draw';
import { logAudit } from '@/lib/audit';
import { isTeamDivision, playSlotFor, roundsOf } from '@/lib/divisions-core';

/** The round number for a division (1 when not given), or null if it has no such round. */
function parseRound(division: string, raw: unknown): number | null {
  const round = raw === undefined || raw === null || raw === '' ? 1 : Number(raw);
  return Number.isInteger(round) && round >= 1 && round <= roundsOf(divisionByCode(division)).length ? round : null;
}

const saveRunOrderSchema = z.object({
  division: z.string().trim().refine((d) => DIVISION_CODES.includes(d), 'Unknown division'),
  /** Ordered array of registration IDs — determines position 1, 2, 3… */
  registration_ids: z.array(z.string().uuid()).min(1).max(200),
  /** 1-based round (default 1) */
  round: z.number().int().min(1).max(5).optional(),
  /** How the order was made (published draws, docs/FORMATS.md). Required when dayOf.publishedDraws is on. */
  draw: z.object({
    method: z.enum(['random', 'rule', 'manual']),
    seed: z.string().trim().max(64).optional(),
    rule: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(300).optional(),
  }).optional(),
});

/**
 * POST /api/admin/run-order
 *
 * Saves the full run order for one round of a division.
 * Completely replaces any existing order for that division + round.
 * Preserves status for rows that already exist; new rows start as 'upcoming'.
 *
 * Body: { division: "<code>", round?: 1, registration_ids: ["uuid1", "uuid2", ...] }
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = saveRunOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division, registration_ids } = parsed.data;
  const round = parseRound(division, parsed.data.round);
  if (round === null) {
    return apiError('bad_request', `${division} has ${roundsOf(divisionByCode(division)).length} round(s)`, requestId);
  }
  if (new Set(registration_ids).size !== registration_ids.length) {
    return apiError('bad_request', 'A registration appears twice in the order', requestId);
  }
  const drawProblem = checkDrawMeta(parsed.data.draw, registration_ids, dayOf.publishedDraws);
  if (drawProblem) return apiError('bad_request', drawProblem, requestId);
  const supabase = createAdminClient();

  // Verify all registration IDs are paid + in this division
  const { data: regs, error: regsError } = await supabase
    .from('vsyc_registrations')
    .select('id, divisions, paid')
    .in('id', registration_ids);

  if (regsError) {
    return apiError('upstream_error', 'Failed to validate registrations', requestId);
  }

  const regMap = new Map((regs ?? []).map((r) => [r.id, r]));

  for (const id of registration_ids) {
    const reg = regMap.get(id);
    if (!reg) return apiError('bad_request', `Registration ${id} not found`, requestId);
    if (!reg.paid) return apiError('unprocessable', `Registration ${id} has not paid`, requestId);
    if (!(reg.divisions as string[]).includes(division)) {
      return apiError('unprocessable', `Registration ${id} is not in division ${division}`, requestId);
    }
  }

  // Fetch existing statuses so we can preserve them on upsert
  const { data: existing } = await supabase
    .from('vsyc_run_order')
    .select('registration_id, status')
    .eq('division', division)
    .eq('round', round);

  const existingStatusMap = new Map((existing ?? []).map((r) => [r.registration_id, r.status]));

  // Build upsert rows
  const rows = registration_ids.map((rid, i) => ({
    division,
    round,
    registration_id: rid,
    position: i + 1,
    status: existingStatusMap.get(rid) ?? 'upcoming',
  }));

  // Delete old rows for this division + round, then insert the new order. The uniques are
  // (division, round, position) and (division, round, registration_id), so a plain upsert
  // could collide on positions mid-reorder.
  const { error: deleteError } = await supabase
    .from('vsyc_run_order')
    .delete()
    .eq('division', division)
    .eq('round', round);

  if (deleteError) {
    return apiError('upstream_error', 'Failed to clear existing run order', requestId);
  }

  const { error: insertError } = await supabase
    .from('vsyc_run_order')
    .insert(rows);

  if (insertError) {
    console.error('[admin/run-order] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save run order', requestId);
  }

  // Record how the order was made. The order is already saved, so a failure here is logged, not fatal.
  const draw = parsed.data.draw;
  if (draw) {
    const { error: drawError } = await supabase.from('vsyc_run_order_draws').insert({
      division, round, method: draw.method,
      seed: draw.method === 'random' ? draw.seed : null,
      rule: draw.method === 'rule' ? draw.rule : null,
      reason: draw.method === 'manual' ? draw.reason : null,
      order_ids: registration_ids,
      made_by: auth.email,
    });
    if (drawError) console.error('[admin/run-order] draw record error:', drawError);
    await logAudit('run_order_saved', { actor: auth.email, details: { division, round, method: draw.method, seed: draw.seed ?? null, reason: draw.reason ?? null } });
  }

  return NextResponse.json(
    { ok: true, division, round, count: rows.length },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});

/**
 * GET /api/admin/run-order?division=1A&round=1
 *
 * Returns full run order rows for one round with registration details for the admin view.
 * `unscheduled` is who can still be added: paid registrants for round 1 (captains only in team
 * divisions), or the previous round's lineup for later rounds.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const division = req.nextUrl.searchParams.get('division');

  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const def = divisionByCode(division);
  const rounds = roundsOf(def);
  const round = parseRound(division, req.nextUrl.searchParams.get('round'));
  if (round === null) {
    return apiError('bad_request', `${division} has ${rounds.length} round(s)`, requestId);
  }

  const supabase = createAdminClient();

  // Team divisions: the captain's registration stands for the team.
  const teamNames = new Map<string, string>();
  if (isTeamDivision(def)) {
    const { data: teams, error: teamError } = await supabase
      .from('vsyc_teams')
      .select('name, captain_registration_id')
      .eq('division', division);
    if (teamError) return apiError('upstream_error', 'Failed to fetch teams', requestId);
    for (const t of teams ?? []) teamNames.set(t.captain_registration_id, t.name);
  }

  // Get all paid registrants in this division (for the "available to add" list)
  const { data: allRegs, error: allRegsError } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, city, state, performance_time_pref, scheduling_notes, paid')
    .contains('divisions', [division])
    .order('created_at', { ascending: true });

  if (allRegsError) {
    return apiError('upstream_error', 'Failed to fetch registrations', requestId);
  }

  // Get current run order
  const { data: runOrder, error: roError } = await supabase
    .from('vsyc_run_order')
    .select('position, status, registration_id')
    .eq('division', division)
    .eq('round', round)
    .order('position', { ascending: true });

  if (roError) {
    return apiError('upstream_error', 'Failed to fetch run order', requestId);
  }

  // Who may be added: the previous round's lineup, or (round 1) every entrant.
  let eligible: Set<string> | null = null;
  if (round > 1) {
    const { data: prev, error: prevError } = await supabase
      .from('vsyc_run_order')
      .select('registration_id')
      .eq('division', division)
      .eq('round', round - 1);
    if (prevError) return apiError('upstream_error', 'Failed to fetch the previous round', requestId);
    eligible = new Set((prev ?? []).map((r) => r.registration_id));
  } else if (isTeamDivision(def)) {
    eligible = new Set(teamNames.keys());
  }

  // Has this round been scored yet? (The advance-to-next-round button checks the next one.)
  const { count: scoredCount } = await supabase
    .from('vsyc_scores')
    .select('id', { count: 'exact', head: true })
    .eq('division', division)
    .eq('round', round);

  // The track this round plays, for each entrant (one per division and slot).
  const musicSlot = playSlotFor(def, round);
  const { data: musicRows } = musicSlot
    ? await supabase
        .from('vsyc_music')
        .select('registration_id, filename, is_fallback')
        .eq('division', division)
        .eq('slot', musicSlot)
    : { data: [] as { registration_id: string; filename: string; is_fallback: boolean }[] };
  const musicByReg = new Map((musicRows ?? []).map((m) => [m.registration_id, m]));

  const orderedIds = new Set((runOrder ?? []).map((r) => r.registration_id));
  const regMap = new Map((allRegs ?? []).map((r) => [r.id, r]));

  const ordered = (runOrder ?? []).map((row) => {
    const reg = regMap.get(row.registration_id);
    return {
      position: row.position,
      status: row.status,
      registration_id: row.registration_id,
      display_name: teamNames.get(row.registration_id) ?? reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
      city: reg?.city ?? null,
      state: reg?.state ?? null,
      performance_time_pref: reg?.performance_time_pref ?? null,
      scheduling_notes: reg?.scheduling_notes ?? null,
      music_filename: musicByReg.get(row.registration_id)?.filename ?? null,
      music_fallback: musicByReg.get(row.registration_id)?.is_fallback ?? false,
      paid: reg?.paid ?? false,
    };
  });

  const unscheduled = (allRegs ?? [])
    .filter((r) => !orderedIds.has(r.id) && (!eligible || eligible.has(r.id)))
    .map((r) => ({
      registration_id: r.id,
      display_name: teamNames.get(r.id) ?? r.preferred_bracket_name ?? `${r.first_name} ${r.last_name}`,
      city: r.city ?? null,
      state: r.state ?? null,
      performance_time_pref: r.performance_time_pref ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      music_filename: musicByReg.get(r.id)?.filename ?? null,
      music_fallback: musicByReg.get(r.id)?.is_fallback ?? false,
      paid: r.paid,
    }));

  return NextResponse.json(
    {
      division,
      round,
      rounds: rounds.map((r) => ({ name: r.name, advance: r.advance ?? null })),
      music_slot: musicSlot,
      scored: (scoredCount ?? 0) > 0,
      ordered,
      unscheduled,
    },
    { headers: { 'x-request-id': requestId } }
  );
});
