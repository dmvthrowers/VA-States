import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { bracketDivision } from '@/lib/bracket-server';

const voteSchema = z.object({
  match_id: z.string().uuid(),
  pick: z.enum(['a', 'b']),
});

/**
 * POST /api/bracket/vote — judge only. `{ match_id, pick: 'a' | 'b' }`.
 * Upserts this judge's vote (one per judge per match; voting again changes it). Only while the
 * match has both entrants and no winner, and only in divisions decided by judges.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !['judge', 'admin'].includes(identity.role)) {
    return apiError('forbidden', 'Judge or admin access required', requestId);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { match_id, pick } = parsed.data;

  const supabase = createAdminClient();
  const { data: match, error } = await supabase
    .from('vsyc_bracket_matches')
    .select('id, division, entry_a, entry_b, winner')
    .eq('id', match_id)
    .maybeSingle();
  if (error) return apiError('upstream_error', 'Failed to load match', requestId);
  if (!match) return apiError('not_found', 'Match not found', requestId);
  const bd = bracketDivision(match.division);
  if (!bd) return apiError('unprocessable', 'Not a bracket division', requestId);
  if ((bd.scoring.decidedBy ?? 'judges') === 'audience') {
    return apiError('unprocessable', 'This battle is decided by the audience poll', requestId);
  }
  if (!match.entry_a || !match.entry_b) return apiError('unprocessable', 'This match does not have two entrants yet', requestId);
  if (match.winner) return apiError('conflict', 'This match already has a winner', requestId);

  const { error: upErr } = await supabase
    .from('vsyc_battle_votes')
    .upsert(
      { match_id, judge_user_id: identity.authUserId, judge_name: identity.displayName, pick, created_at: new Date().toISOString() },
      { onConflict: 'match_id,judge_user_id' },
    );
  if (upErr) {
    console.error('[bracket/vote] upsert error:', upErr);
    return apiError('upstream_error', 'Failed to save vote', requestId);
  }

  return NextResponse.json({ ok: true, match_id, pick }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } });
});
