import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { applyScore } from '@/lib/bracket-server';

const score = z.number().int().min(0).max(99).nullable();
const schema = z.object({
  match_id: z.string().uuid(),
  score_a: score,
  score_b: score,
  /** The match's updated_at as the caller saw it; a mismatch is a 409 instead of an overwrite. */
  expected_updated_at: z.string().max(40).optional(),
});

/**
 * POST /api/admin/bracket/score — admin or run-order editor (DJ/audio, judge).
 * `{ match_id, score_a, score_b, expected_updated_at? }` for divisions with `matchScoring` (first to N).
 *
 * Saves the running score. Once a side reaches the target, that side is set as the winner exactly as
 * /api/admin/bracket/winner would; a score that isn't decisive takes a standing winner back. Answers with
 * the outcome (`in_progress`, `decided` or `empty`) and the division's matches.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { match_id, score_a, score_b, expected_updated_at } = parsed.data;

  const result = await applyScore(createAdminClient(), match_id, score_a, score_b, expected_updated_at);
  if (!result.ok) return apiError(result.code, result.message, requestId);

  await logAudit('bracket_score_set', { actor: auth.email, details: { match_id, score_a, score_b, outcome: result.outcome.state } });
  return NextResponse.json(
    { ok: true, outcome: result.outcome, changed: result.changed, matches: result.rows },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
