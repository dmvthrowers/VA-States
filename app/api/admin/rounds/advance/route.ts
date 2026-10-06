import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { logAudit } from '@/lib/audit';
import { advanceCount, cutAt, isRoundActive, nextActiveRound } from '@/lib/round-plan';
import { loadPlan } from '@/lib/round-plan-server';
import { fetchStandings } from '@/lib/standings';

const schema = z.object({
  division: z.string().trim().refine((d) => DIVISION_CODES.includes(d), 'Unknown division'),
  from_round: z.number().int().min(1).max(5),
  /** Overwrite a next-round run order that already exists */
  replace: z.boolean().optional(),
  /** Work out who would advance and any tie at the cut, but write nothing */
  dry_run: z.boolean().optional(),
  /** A tie across the cut: "all" advances every tied entrant; "pick" advances only `pick` */
  ties: z.enum(['all', 'pick']).optional(),
  /** With ties: "pick", the tied registration ids to advance (as many as there are open spots) */
  pick: z.array(z.string().uuid()).max(200).optional(),
});

/**
 * POST /api/admin/rounds/advance (admin)
 *
 * Body: { division, from_round, replace?, dry_run?, ties?, pick? }
 *
 * Takes the top entrants from `from_round`'s standings and writes them as the run order for the
 * next round that runs, in reverse rank order so the best seed performs last. How many advance,
 * and which round is next, come from the division's confirmed round plan (see
 * /api/admin/rounds/plan) or, for a division without one, from its rounds' `advance` counts.
 *
 * A tie across the cut (more tied at the cutoff score than there are spots) needs a decision:
 * send `ties: "all"` to advance everyone tied, or `ties: "pick"` with `pick` set to the tied
 * entrants to advance. Without one the call is refused (409, `tie` lists who). `dry_run: true`
 * returns the same preview without writing.
 *
 * - Refused (409) if the division has a round plan that isn't confirmed yet.
 * - Refused (409) if the next round already has scores.
 * - Refused (409) if the next round already has a run order, unless `replace: true`.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division, from_round, replace = false, dry_run = false, ties, pick = [] } = parsed.data;
  const def = divisionByCode(division)!;
  const rounds = roundsOf(def);
  const supabase = createAdminClient();

  const plan = await loadPlan(supabase, division);
  if (def.roundPlan?.length && !plan) {
    return apiError('conflict', `Confirm ${def.name}'s round plan first (which rounds run depends on how many entered).`, requestId);
  }
  if (!isRoundActive(def, plan, from_round)) {
    return apiError('unprocessable', `${rounds[from_round - 1]?.name ?? `Round ${from_round}`} isn't running for ${def.name}`, requestId);
  }
  const from = rounds[from_round - 1];
  const toRound = nextActiveRound(def, plan, from_round);
  const count = advanceCount(def, plan, from_round);
  if (!from || toRound === null || !count) {
    return apiError('unprocessable', `${def.name} has no round after ${from?.name ?? `round ${from_round}`} to advance into`, requestId);
  }

  const { count: scored, error: scoredError } = await supabase
    .from('vsyc_scores')
    .select('id', { count: 'exact', head: true })
    .eq('division', division)
    .eq('round', toRound);
  if (scoredError) return apiError('upstream_error', 'Failed to check next-round scores', requestId);
  if ((scored ?? 0) > 0) {
    return apiError('conflict', `${rounds[toRound - 1].name} already has scores; its run order can't be rebuilt`, requestId);
  }

  const { data: existing, error: existingError } = await supabase
    .from('vsyc_run_order')
    .select('registration_id')
    .eq('division', division)
    .eq('round', toRound);
  if (existingError) return apiError('upstream_error', 'Failed to read the next-round run order', requestId);
  if ((existing ?? []).length > 0 && !replace && !dry_run) {
    return apiError('conflict', `${rounds[toRound - 1].name} already has a run order. Send replace: true to overwrite it.`, requestId);
  }

  const standings = (await fetchStandings(supabase))[division];
  const ranked = standings?.rounds[from_round - 1]?.rows ?? [];
  if (ranked.length === 0) {
    return apiError('unprocessable', `No scores in ${from.name} yet`, requestId);
  }
  const cut = cutAt(ranked, count);

  const tiePreview = cut.tied.length
    ? { slots: cut.slots, score: cut.tied[0].value_label, tied: cut.tied.map((r) => ({ registration_id: r.registration_id, display_name: r.display_name, place: r.place })) }
    : null;

  let moving = [...cut.clear];
  if (tiePreview) {
    if (ties === 'all') {
      moving = [...cut.clear, ...cut.tied];
    } else if (ties === 'pick') {
      const tiedIds = new Set(cut.tied.map((r) => r.registration_id));
      const chosen = [...new Set(pick)];
      if (chosen.length !== cut.slots || !chosen.every((id) => tiedIds.has(id))) {
        return apiError('unprocessable', `Pick exactly ${cut.slots} of the ${cut.tied.length} tied entrants`, requestId);
      }
      moving = [...cut.clear, ...cut.tied.filter((r) => chosen.includes(r.registration_id))];
    } else if (!dry_run) {
      return NextResponse.json(
        { error: { code: 'conflict', message: `${cut.tied.length} entrants tie at the cut for ${cut.slots} open spot${cut.slots === 1 ? '' : 's'}. Advance them all, or pick.`, requestId }, tie: tiePreview },
        { status: 409, headers: { 'x-request-id': requestId } },
      );
    } else {
      moving = [...cut.clear];
    }
  }

  const summary = moving.map((r) => ({ registration_id: r.registration_id, display_name: r.display_name, place: r.place }));
  if (dry_run) {
    return NextResponse.json(
      { ok: true, dry_run: true, division, from_round, to_round: toRound, to_round_name: rounds[toRound - 1].name, advance: count, count: summary.length, advanced: summary, tie: tiePreview },
      { headers: { 'x-request-id': requestId } },
    );
  }

  // Best seed last.
  const rows = [...moving].reverse().map((r, i) => ({
    division,
    round: toRound,
    registration_id: r.registration_id,
    position: i + 1,
    status: 'upcoming',
  }));

  if ((existing ?? []).length > 0) {
    const { error } = await supabase.from('vsyc_run_order').delete().eq('division', division).eq('round', toRound);
    if (error) return apiError('upstream_error', 'Failed to clear the next-round run order', requestId);
  }
  const { error: insertError } = await supabase.from('vsyc_run_order').insert(rows);
  if (insertError) {
    console.error('[admin/rounds/advance] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save the next-round run order', requestId);
  }

  await logAudit('round_advanced', {
    actor: auth.email,
    details: { division, from_round, to_round: toRound, advance: count, count: rows.length, ties: tiePreview ? (ties ?? null) : null, tied: tiePreview?.tied.map((t) => t.registration_id) ?? [] },
  });

  return NextResponse.json(
    {
      ok: true,
      division,
      from_round,
      to_round: toRound,
      to_round_name: rounds[toRound - 1].name,
      advance: count,
      count: rows.length,
      advanced: summary,
      tie: tiePreview,
    },
    { headers: { 'x-request-id': requestId } },
  );
});
