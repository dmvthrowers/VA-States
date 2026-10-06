import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { competition, contest } from '@/contest.config';
import { isTeamDivision } from '@/lib/divisions-core';
import { prizePlan } from '@/lib/prizes';

/**
 * GET /api/admin/prizes (admin)
 *
 * The prize plan for the number of people entered so far (paid registrations per division, or teams
 * in a team division): the podium places and champion prize for each division, and the total to buy
 * or set aside. It moves as registration does and follows contest.prizes and each division's own
 * `prizes` (lib/prizes.ts). The total is a maximum: a division with no eligible home-state finisher
 * won't award its champion prize. Read-only.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const db = createAdminClient();
  const entrants: Record<string, number> = {};
  for (const d of competition.divisions) {
    if (isTeamDivision(d)) {
      const { count, error } = await db.from('vsyc_teams').select('id', { count: 'exact', head: true }).eq('division', d.code);
      if (error) return apiError('upstream_error', `Failed to count teams in ${d.code}`, requestId);
      entrants[d.code] = count ?? 0;
    } else {
      const { count, error } = await db.from('vsyc_registrations').select('id', { count: 'exact', head: true }).contains('divisions', [d.code]).eq('paid', true);
      if (error) return apiError('upstream_error', `Failed to count entrants in ${d.code}`, requestId);
      entrants[d.code] = count ?? 0;
    }
  }
  const plan = prizePlan(competition.divisions, entrants, { places: contest.prizes.places, championState: contest.stateChampion.state });
  return NextResponse.json(
    { default_places: contest.prizes.places, champion_state: contest.stateChampion.state, champion_title: contest.stateChampion.title, ...plan },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
