import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { isNameRestricted, publicDisplayName } from '@/lib/display-name';
import { buildMcCards, type McCardRow } from '@/lib/mc-cards';

/**
 * GET /api/staff/mc-cards?division=<code>&round=<n>   (admin)
 *
 * One card per competitor in run order for the announcer (master plan T4). Names follow the public-name
 * rules because the announcer reads them to the room. Never cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const division = req.nextUrl.searchParams.get('division');
  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const def = divisionByCode(division)!;
  const roundParam = req.nextUrl.searchParams.get('round');
  const round = roundParam === null || roundParam === '' ? 1 : Number(roundParam);
  if (!Number.isInteger(round) || round < 1 || round > roundsOf(def).length) {
    return apiError('bad_request', `round must be 1–${roundsOf(def).length} for ${division}`, requestId);
  }

  const { data, error } = await createAdminClient()
    .from('vsyc_run_order')
    .select('position, status, vsyc_registrations (first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public, city, state, club_affiliation, name_pronunciation, intro_note, sponsor_name)')
    .eq('division', division).eq('round', round).order('position', { ascending: true });
  if (error) {
    console.error('[staff/mc-cards] query error:', error);
    return apiError('upstream_error', 'Failed to load the cards', requestId);
  }

  const rows: McCardRow[] = (data ?? []).map((r) => {
    const reg = (Array.isArray(r.vsyc_registrations) ? r.vsyc_registrations[0] : r.vsyc_registrations) ?? {};
    return { ...(reg as Omit<McCardRow, 'position' | 'status'>), position: r.position as number, status: r.status as McCardRow['status'] };
  });
  return NextResponse.json(
    { division, round, round_name: roundsOf(def)[round - 1].name, cards: buildMcCards(rows, { isNameRestricted, publicDisplayName }) },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
