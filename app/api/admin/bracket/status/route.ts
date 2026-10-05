import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { extraLiveMatches } from '@/lib/bracket-store';
import { MATCH_FIELDS } from '@/lib/bracket-server';

const schema = z.object({
  match_id: z.string().uuid(),
  status: z.enum(['pending', 'live', 'done']),
});

/**
 * POST /api/admin/bracket/status — admin or run-order editor. `{ match_id, status }`
 *
 * Marks which battle is on. Only one match per division is 'live': setting one live puts any
 * other live match in that division back to 'pending'. If two people set different matches
 * live at once, both requests settle on the most recently updated one.
 * 'live' needs both entrants and no winner; 'done' needs a winner.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { match_id, status } = parsed.data;

  const supabase = createAdminClient();
  const { data: match, error } = await supabase
    .from('vsyc_bracket_matches')
    .select('id, division, entry_a, entry_b, winner, status')
    .eq('id', match_id)
    .maybeSingle();
  if (error) return apiError('upstream_error', 'Failed to load match', requestId);
  if (!match) return apiError('not_found', 'Match not found', requestId);
  if (status === 'live' && (!match.entry_a || !match.entry_b || match.winner)) {
    return apiError('unprocessable', 'Only a match with two entrants and no winner can go live', requestId);
  }
  if (status === 'done' && !match.winner) return apiError('unprocessable', 'Confirm a winner to finish this match', requestId);

  const { error: upErr } = await supabase.from('vsyc_bracket_matches').update({ status }).eq('id', match_id);
  if (upErr) return apiError('upstream_error', 'Failed to update match', requestId);

  let liveId: string | null = status === 'live' ? match_id : null;
  if (status === 'live') {
    const { data: live, error: lErr } = await supabase
      .from('vsyc_bracket_matches')
      .select('id, updated_at')
      .eq('division', match.division)
      .eq('status', 'live');
    if (lErr) return apiError('upstream_error', 'Failed to check live matches', requestId);
    const { keep, demote } = extraLiveMatches(live ?? []);
    liveId = keep;
    if (demote.length) {
      const { error: dErr } = await supabase.from('vsyc_bracket_matches').update({ status: 'pending' }).in('id', demote).eq('status', 'live');
      if (dErr) return apiError('upstream_error', 'Failed to update the previous live match', requestId);
    }
  }

  const { data: saved } = await supabase.from('vsyc_bracket_matches').select(MATCH_FIELDS).eq('id', match_id).maybeSingle();
  return NextResponse.json(
    { ok: true, match: saved, live_match_id: liveId },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
