import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { z } from 'zod';

const advanceSchema = z.object({
  division: z.enum(['1A', 'X', 'SBJ']),
});

/**
 * POST /api/admin/run-order/advance
 *
 * Advances the run order for a division:
 * - Marks the current 'performing' competitor as 'done'
 * - Promotes the lowest-position 'upcoming' competitor to 'performing'
 *
 * Body: { division: "1A" }
 *
 * Returns the new state (who is now performing, who is next).
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division } = parsed.data;
  const supabase = createAdminClient();

  // Fetch full run order for this division
  const { data: runOrder, error: roError } = await supabase
    .from('vsyc_run_order')
    .select('id, position, status, registration_id')
    .eq('division', division)
    .order('position', { ascending: true });

  if (roError || !runOrder) {
    return apiError('upstream_error', 'Failed to fetch run order', requestId);
  }

  if (runOrder.length === 0) {
    return apiError('not_found', 'No run order set for this division', requestId);
  }

  const performing = runOrder.find((r) => r.status === 'performing');
  const upcoming = runOrder.filter((r) => r.status === 'upcoming').sort((a, b) => a.position - b.position);

  if (!performing && upcoming.length === 0) {
    return NextResponse.json(
      { division, message: 'All performers are done', now_performing: null, next_up: null },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // Start the division if nothing is performing yet
  if (!performing && upcoming.length > 0) {
    const first = upcoming[0];
    await supabase
      .from('vsyc_run_order')
      .update({ status: 'performing' })
      .eq('id', first.id);

    const nextUp = upcoming[1] ?? null;
    return NextResponse.json(
      { division, now_performing: first.registration_id, next_up: nextUp?.registration_id ?? null },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // Advance: mark current as done, promote next upcoming
  if (performing) {
    await supabase
      .from('vsyc_run_order')
      .update({ status: 'done' })
      .eq('id', performing.id);
  }

  let nowPerformingId: string | null = null;
  if (upcoming.length > 0) {
    const next = upcoming[0];
    await supabase
      .from('vsyc_run_order')
      .update({ status: 'performing' })
      .eq('id', next.id);
    nowPerformingId = next.registration_id;
  }

  const nextUp = upcoming[1] ?? null;

  return NextResponse.json(
    {
      division,
      prev_performer: performing?.registration_id ?? null,
      now_performing: nowPerformingId,
      next_up: nextUp?.registration_id ?? null,
      division_complete: nowPerformingId === null,
    },
    { headers: { 'x-request-id': requestId } }
  );
});

/**
 * DELETE /api/admin/run-order/advance
 *
 * Resets the run order for a division: all rows back to 'upcoming'.
 * Use before starting or to restart a division.
 *
 * Body: { division: "1A" }
 */
export const DELETE = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division } = parsed.data;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('vsyc_run_order')
    .update({ status: 'upcoming' })
    .eq('division', division);

  if (error) {
    return apiError('upstream_error', 'Failed to reset run order', requestId);
  }

  return NextResponse.json(
    { ok: true, division, message: 'Run order reset to upcoming' },
    { headers: { 'x-request-id': requestId } }
  );
});
