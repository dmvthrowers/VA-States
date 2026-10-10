import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireScoreReviewRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { dayOf, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { gateFor } from '@/lib/release-gate-server';
import { scoreFingerprint } from '@/lib/release-gate';

/**
 * Release gates (master plan T2; docs/FORMATS.md → Release gates). Admins and judges.
 *
 *  GET  → { enabled, items: [{ item_id, title, division, round, open, reasons, checked, checked_by, checked_at }] }
 *         for every judged block on the day-of schedule.
 *  POST { division, round, checked } → head judge taps "checked" (or takes it back). Checking is refused
 *         while the scores-in board has gaps, because there is nothing complete to check yet.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const bodySchema = z.object({
  division: z.string().trim().min(1).max(20),
  round: z.number().int().min(1).max(5).default(1),
  checked: z.boolean(),
});

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireScoreReviewRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const db = createAdminClient();
  const blocks = dayOf.schedule.filter((i) => i.division);
  const items = await Promise.all(blocks.map(async (i) => {
    const round = i.round ?? 1;
    const g = await gateFor(db, i.division!, round);
    return {
      item_id: i.id, title: i.title, division: i.division!, round,
      open: g.ok ? g.verdict.open : false,
      reasons: g.ok ? g.verdict.reasons : ['Could not read the scores.'],
      checked: g.ok ? g.verdict.checked : false,
      checked_by: g.ok && g.verdict.checked ? g.check?.checked_by ?? null : null,
      checked_at: g.ok && g.verdict.checked ? g.check?.checked_at ?? null : null,
    };
  }));
  return NextResponse.json({ enabled: dayOf.releaseGates === true, items }, { headers: { 'x-request-id': requestId, ...NO_STORE } });
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireScoreReviewRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { division, round, checked } = parsed.data;
  const def = divisionByCode(division);
  if (!def) return apiError('not_found', `No division "${division}"`, requestId);
  if (round > roundsOf(def).length) return apiError('bad_request', `${division} has ${roundsOf(def).length} round(s)`, requestId);

  const db = createAdminClient();
  if (!checked) {
    const { error } = await db.from('vsyc_release_checks').delete().eq('division', division).eq('round', round);
    if (error) {
      console.error('[admin/release-check] delete error:', error);
      return apiError('upstream_error', 'Failed to take back the check', requestId);
    }
    await logAudit('release_unchecked', { actor: auth.email, details: { division, round } });
    return NextResponse.json({ division, round, checked: false }, { headers: { 'x-request-id': requestId, ...NO_STORE } });
  }

  const g = await gateFor(db, division, round);
  if (!g.ok) return apiError('upstream_error', 'Failed to read the scores', requestId);
  if (!g.status) return apiError('conflict', `${def.name} isn't scored on a score sheet, so there is nothing to check`, requestId);
  if (!g.status.ready) {
    return apiError('conflict', `The scores-in board isn't full: ${g.status.blockers.join(' ')}`, requestId);
  }
  const { error } = await db.from('vsyc_release_checks').upsert(
    { division, round, checked_by: auth.email, checked_at: new Date().toISOString(), fingerprint: scoreFingerprint(g.status) },
    { onConflict: 'division,round' },
  );
  if (error) {
    console.error('[admin/release-check] upsert error:', error);
    return apiError('upstream_error', 'Failed to save the check', requestId);
  }
  await logAudit('release_checked', { actor: auth.email, details: { division, round, fingerprint: scoreFingerprint(g.status) } });
  return NextResponse.json({ division, round, checked: true }, { headers: { 'x-request-id': requestId, ...NO_STORE } });
});
