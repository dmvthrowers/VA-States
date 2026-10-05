import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { fetchStandings, roundAdvancers } from '@/lib/standings';

const schema = z.object({
  division: z.string().trim().refine((d) => DIVISION_CODES.includes(d), 'Unknown division'),
  from_round: z.number().int().min(1).max(5),
  /** Overwrite a next-round run order that already exists */
  replace: z.boolean().optional(),
});

/**
 * POST /api/admin/rounds/advance (admin)
 *
 * Body: { division, from_round, replace?: boolean }
 *
 * Takes the top `advance` entrants from `from_round`'s standings (ties at the cut all go through)
 * and writes them as the run order for the next round, in reverse rank order so the best seed
 * performs last.
 *
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

  const { division, from_round, replace = false } = parsed.data;
  const def = divisionByCode(division)!;
  const rounds = roundsOf(def);
  const from = rounds[from_round - 1];
  if (!from || from_round >= rounds.length || !from.advance) {
    return apiError('unprocessable', `${def.name} has no round after round ${from_round} to advance into`, requestId);
  }
  const toRound = from_round + 1;
  const supabase = createAdminClient();

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
  if ((existing ?? []).length > 0 && !replace) {
    return apiError('conflict', `${rounds[toRound - 1].name} already has a run order. Send replace: true to overwrite it.`, requestId);
  }

  const standings = (await fetchStandings(supabase))[division];
  const moving = roundAdvancers(def, standings, from_round);
  if (moving.length === 0) {
    return apiError('unprocessable', `No scores in ${from.name} yet`, requestId);
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

  return NextResponse.json(
    {
      ok: true,
      division,
      from_round,
      to_round: toRound,
      to_round_name: rounds[toRound - 1].name,
      advance: from.advance,
      count: rows.length,
      advanced: moving.map((r) => ({ registration_id: r.registration_id, display_name: r.display_name, place: r.place })),
    },
    { headers: { 'x-request-id': requestId } },
  );
});
