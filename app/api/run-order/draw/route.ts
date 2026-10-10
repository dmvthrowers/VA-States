import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';

/**
 * GET /api/run-order/draw?division=<code>&round=<n>   (public)
 *
 * How this round's run order was made (published draws, docs/FORMATS.md): the latest recorded draw.
 * Random draws carry their seed, so anyone can re-run lib/draw.ts on the run order and check it.
 * Names and ids are not included; the run-order page already shows who is in the round.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division');
  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const rounds = roundsOf(divisionByCode(division));
  const roundParam = req.nextUrl.searchParams.get('round');
  const round = roundParam === null || roundParam === '' ? 1 : Number(roundParam);
  if (!Number.isInteger(round) || round < 1 || round > rounds.length) {
    return apiError('bad_request', `round must be 1–${rounds.length} for ${division}`, requestId);
  }

  const { data, error } = await createAdminClient()
    .from('vsyc_run_order_draws')
    .select('method, seed, rule, reason, created_at')
    .eq('division', division).eq('round', round)
    .order('created_at', { ascending: false }).limit(1);
  if (error) {
    console.error('[run-order/draw] query error:', error);
    return apiError('upstream_error', 'Failed to load the draw', requestId);
  }
  return NextResponse.json(
    { division, round, draw: data?.[0] ?? null },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
  );
});
