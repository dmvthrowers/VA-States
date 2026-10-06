import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { bracketPlacements } from '@/lib/divisions-core';
import { mainRounds, toMatches } from '@/lib/bracket-store';
import { bracketDivision, entryNames, loadMatches } from '@/lib/bracket-server';

/**
 * GET /api/bracket?division=<code>
 *
 * Public: the division's battle bracket with privacy-safe names (team names in team
 * divisions; minors not opted in get a handle or first name + last initial). Brackets are live
 * during the event, so this isn't gated on results_published.
 *
 * With a judge or admin bearer token: full names, plus `votes: { [match_id]: { a, b, mine } }`
 * (judge vote counts; `mine` is this judge's pick or null). Staff responses are never cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division');
  const bd = bracketDivision(division);
  if (!division || !bd) return apiError('bad_request', 'division must be a bracket division', requestId);

  let viewer: { id: string; role: string } | null = null;
  const token = getBearerToken(req);
  if (token) {
    const identity = await getStaffIdentityFromToken(token);
    if (identity?.isActive && (identity.role === 'judge' || identity.role === 'admin')) {
      viewer = { id: identity.authUserId, role: identity.role };
    }
  }

  const supabase = createAdminClient();
  const { rows, error } = await loadMatches(supabase, division);
  if (error) {
    console.error('[bracket] query error:', error);
    return apiError('upstream_error', 'Failed to fetch bracket', requestId);
  }

  const ids = rows.flatMap((r) => [r.entry_a, r.entry_b, r.winner]).filter((x): x is string => !!x);
  const names = await entryNames(supabase, division, ids, viewer !== null);
  const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);

  const matches = toMatches(rows);
  const placements = bracketPlacements(matches, { thirdPlaceByVotes: bd.scoring.thirdPlaceByVotes })
    .map((p) => ({ ...p, name: nameOf(p.entry) }));

  let votes: Record<string, { a: number; b: number; mine: 'a' | 'b' | null }> | undefined;
  if (viewer && rows.length) {
    const { data: voteRows, error: vErr } = await supabase
      .from('vsyc_battle_votes')
      .select('match_id, judge_user_id, pick')
      .in('match_id', rows.map((r) => r.id));
    if (vErr) return apiError('upstream_error', 'Failed to fetch votes', requestId);
    votes = {};
    for (const v of voteRows ?? []) {
      const t = (votes[v.match_id] ??= { a: 0, b: 0, mine: null });
      if (v.pick === 'a') t.a++; else t.b++;
      if (v.judge_user_id === viewer.id) t.mine = v.pick;
    }
  }

  const body = {
    division,
    division_name: bd.def.name,
    decided_by: bd.scoring.decidedBy ?? 'judges',
    third_place_match: bd.scoring.thirdPlaceMatch,
    match_format: bd.scoring.matchFormat ?? null,
    rules: bd.scoring.rules ?? [],
    rounds: mainRounds(matches),
    matches: rows.map((r) => ({
      id: r.id,
      round: r.round,
      position: r.position,
      is_third_place: r.is_third_place,
      entry_a: r.entry_a,
      entry_b: r.entry_b,
      winner: r.winner,
      status: r.status,
      updated_at: r.updated_at,
      votes_a: r.votes_a ?? null,
      votes_b: r.votes_b ?? null,
      a_name: nameOf(r.entry_a),
      b_name: nameOf(r.entry_b),
      winner_name: nameOf(r.winner),
    })),
    placements,
    ...(votes ? { votes } : {}),
  };

  return NextResponse.json(body, {
    headers: {
      'x-request-id': requestId,
      Vary: 'Authorization',
      'Cache-Control': viewer ? 'private, no-store' : 'public, s-maxage=3, stale-while-revalidate=10',
    },
  });
});
