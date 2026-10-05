import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { pollWinner } from '@/lib/divisions-core';
import { toMatches, type MatchRow } from '@/lib/bracket-store';
import { MATCH_FIELDS, bracketDivision } from '@/lib/bracket-server';

const count = z.number().int().min(0).max(10_000_000).nullable();
const schema = z.object({
  match_id: z.string().uuid(),
  votes_a: count,
  votes_b: count,
});

/**
 * POST /api/admin/bracket/votes — admin or run-order editor.
 * `{ match_id, votes_a, votes_b }` records an audience poll's counts (e.g. a stream chat poll).
 * It never sets the winner: an admin confirms it via /api/admin/bracket/winner. The response's
 * `suggested_winner` is pollWinner() (null on a tie).
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { match_id, votes_a, votes_b } = parsed.data;

  const supabase = createAdminClient();
  const { data: match, error } = await supabase.from('vsyc_bracket_matches').select('id, division, entry_a, entry_b').eq('id', match_id).maybeSingle();
  if (error) return apiError('upstream_error', 'Failed to load match', requestId);
  if (!match) return apiError('not_found', 'Match not found', requestId);
  if (!bracketDivision(match.division)) return apiError('unprocessable', 'Not a bracket division', requestId);
  if (!match.entry_a || !match.entry_b) return apiError('unprocessable', 'This match does not have two entrants yet', requestId);

  const { data: saved, error: upErr } = await supabase
    .from('vsyc_bracket_matches')
    .update({ votes_a, votes_b })
    .eq('id', match_id)
    .select(MATCH_FIELDS)
    .maybeSingle();
  if (upErr || !saved) return apiError('upstream_error', 'Failed to save the poll counts', requestId);

  await logAudit('bracket_poll_votes', { actor: auth.email, details: { match_id, votes_a, votes_b } });
  const [m] = toMatches([saved as MatchRow]);
  return NextResponse.json(
    { ok: true, match: saved, suggested_winner: pollWinner(m) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
