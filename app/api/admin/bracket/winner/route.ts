import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { applyWinner } from '@/lib/bracket-server';

const schema = z.object({
  match_id: z.string().uuid(),
  /** The winning registration id, or null to clear the result. */
  winner: z.string().uuid().nullable(),
  /** The match's updated_at as the caller saw it; a mismatch is a 409 instead of an overwrite. */
  expected_updated_at: z.string().max(40).optional(),
});

/**
 * POST /api/admin/bracket/winner — admin or run-order editor (DJ/audio, judge).
 * `{ match_id, winner: <registration id> | null, expected_updated_at? }`
 *
 * Applies setWinner (advancing the winner, filling the third-place match, clearing stale later
 * results) or clears the result, and saves every changed match. The match becomes 'done' when
 * a winner is set. Safe against double clicks and two people confirming at once: see
 * applyWinner in lib/bracket-server.ts.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { match_id, winner, expected_updated_at } = parsed.data;

  const result = await applyWinner(createAdminClient(), match_id, winner, expected_updated_at);
  if (!result.ok) return apiError(result.code, result.message, requestId);

  await logAudit(winner ? 'bracket_winner_set' : 'bracket_winner_cleared', {
    registrationId: winner ?? undefined,
    actor: auth.email,
    details: { match_id, changed: result.changed },
  });
  return NextResponse.json(
    { ok: true, changed: result.changed, matches: result.rows },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
