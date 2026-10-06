import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { bracketDivision, entryNames, loadMatches } from '@/lib/bracket-server';
import { mainRounds } from '@/lib/bracket-store';
import { battleCue, cueOrder } from '@/lib/battle-cue';
import { playSlotFor } from '@/lib/divisions-core';
import { slotLabel } from '@/lib/music-config';
import { bracketRoundLabel } from '@/lib/standings';

/**
 * GET /api/dj/battle?division=<code>   (DJ, audio tech or admin)
 *
 * The battle queue for a bracket division: every match in play order with both entrants' names
 * and whether each has a battle track, plus which match to cue (`cue_id`: the live match, else
 * the next undecided one). Play a track with /api/dj/music-url using the entrant's id and `slot`.
 * Never cached: staff see full names.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity?.isActive || !['dj', 'audio_tech', 'admin'].includes(identity.role)) {
    return apiError('forbidden', 'DJ/audio staff access required', requestId);
  }

  const division = req.nextUrl.searchParams.get('division');
  const bd = bracketDivision(division);
  if (!division || !bd) return apiError('bad_request', 'division must be a bracket division', requestId);

  const supabase = createAdminClient();
  const { rows, error } = await loadMatches(supabase, division);
  if (error) {
    console.error('[dj/battle] query error:', error);
    return apiError('upstream_error', 'Failed to fetch the bracket', requestId);
  }

  const slot = playSlotFor(bd.def);
  const ids = [...new Set(rows.flatMap((r) => [r.entry_a, r.entry_b]).filter((x): x is string => !!x))];
  const names = await entryNames(supabase, division, ids, true);

  const tracks = new Map<string, { filename: string; is_fallback: boolean }>();
  if (slot && ids.length) {
    const { data, error: musicError } = await supabase
      .from('vsyc_music')
      .select('registration_id, filename, is_fallback')
      .eq('division', division)
      .eq('slot', slot)
      .in('registration_id', ids);
    if (musicError) return apiError('upstream_error', 'Failed to look up battle tracks', requestId);
    for (const m of data ?? []) tracks.set(m.registration_id, { filename: m.filename, is_fallback: m.is_fallback });
  }

  const side = (id: string | null) =>
    id
      ? {
          id,
          name: names.get(id) ?? 'Unnamed competitor',
          filename: tracks.get(id)?.filename ?? null,
          is_fallback: tracks.get(id)?.is_fallback ?? false,
        }
      : null;

  const total = mainRounds(rows);
  const cue = battleCue(rows);
  const matches = cueOrder(rows).map((r) => ({
    id: r.id,
    round: r.round,
    round_label: r.is_third_place ? 'Third place' : bracketRoundLabel(r.round, total),
    position: r.position,
    is_third_place: r.is_third_place,
    status: r.status,
    winner: r.winner,
    a: side(r.entry_a),
    b: side(r.entry_b),
  }));

  return NextResponse.json(
    {
      division,
      division_name: bd.def.name,
      slot,
      slot_label: slot ? slotLabel(division, slot) : null,
      match_format: bd.scoring.matchFormat ?? null,
      rules: bd.scoring.rules ?? [],
      cue_id: cue?.id ?? null,
      matches,
    },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
