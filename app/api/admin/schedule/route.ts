import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { dayOf } from '@/contest.config';
import { applyScheduleAction, type ScheduleState } from '@/lib/schedule-core';
import { buildScheduleFeed } from '@/lib/schedule-feed';

/**
 * Day-of schedule controls (docs/FORMATS.md → Live schedule). Admins and run-order editors
 * (DJ/audio, judges) can run it, so the MC can drive the day from one screen.
 *
 *  GET  /api/admin/schedule → the same feed as GET /api/schedule, never cached.
 *  POST /api/admin/schedule { item_id, action } → applies applyScheduleAction and answers
 *       with the new feed. 'publish' releases that block's division:round results;
 *       'reset' clears the block and removes its release. An action that doesn't fit the
 *       block's state is a 409 with the reason.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const bodySchema = z.object({
  item_id: z.string().trim().max(41),
  action: z.enum(['start', 'close_judging', 'publish', 'done', 'reset']),
});

async function feedResponse(requestId: string) {
  try {
    const feed = await buildScheduleFeed(createAdminClient());
    return NextResponse.json(feed, { headers: { 'x-request-id': requestId, ...NO_STORE } });
  } catch (e) {
    console.error('[admin/schedule] feed error:', e);
    return apiError('upstream_error', 'Failed to load the schedule', requestId, NO_STORE);
  }
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  return feedResponse(requestId);
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const { item_id, action } = parsed.data;
  const item = dayOf.schedule.find((i) => i.id === item_id);
  if (!item) return apiError('not_found', `No schedule block "${item_id}"`, requestId);

  const supabase = createAdminClient();
  const { data: row, error: readError } = await supabase
    .from('vsyc_schedule_state')
    .select('item_id, status, started_at, ended_at, published_at')
    .eq('item_id', item_id)
    .maybeSingle();
  if (readError) {
    console.error('[admin/schedule] read error:', readError);
    return apiError('upstream_error', 'Failed to read the schedule', requestId);
  }
  const prev = (row ?? undefined) as ScheduleState | undefined;

  let next: ScheduleState;
  try {
    next = applyScheduleAction(item, prev, action, new Date());
  } catch (e) {
    return apiError('conflict', e instanceof Error ? e.message : 'That action does not fit this block', requestId);
  }

  const division = item.division ?? null;
  const round = item.round ?? 1;

  // Release first, then the state: if the state write fails, the same action can be retried.
  if (division && action === 'publish') {
    const { error } = await supabase.from('vsyc_results_releases').upsert(
      { division, round, published_at: next.published_at, published_by: auth.email },
      { onConflict: 'division,round' },
    );
    if (error) {
      console.error('[admin/schedule] release error:', error);
      return apiError('upstream_error', 'Failed to publish the results', requestId);
    }
  }
  if (division && action === 'reset') {
    const { error } = await supabase.from('vsyc_results_releases').delete().eq('division', division).eq('round', round);
    if (error) {
      console.error('[admin/schedule] unrelease error:', error);
      return apiError('upstream_error', 'Failed to withdraw the results', requestId);
    }
  }

  const { error: writeError } = await supabase.from('vsyc_schedule_state').upsert(
    { ...next, updated_by: auth.email, updated_at: new Date().toISOString() },
    { onConflict: 'item_id' },
  );
  if (writeError) {
    console.error('[admin/schedule] write error:', writeError);
    return apiError('upstream_error', 'Failed to save the schedule', requestId);
  }

  await logAudit(`schedule_${action}`, {
    actor: auth.email,
    details: { item_id, title: item.title, division, round: division ? round : null, from: prev?.status ?? 'upcoming', to: next.status },
  });

  // The results page is ISR; show a release (or its withdrawal) right away.
  if (division && (action === 'publish' || action === 'reset')) {
    try { revalidatePath('/results'); } catch (e) { console.error('[admin/schedule] revalidate failed:', e); }
  }

  return feedResponse(requestId);
});
