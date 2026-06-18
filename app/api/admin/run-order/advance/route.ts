import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb } from '@/lib/db';
import { z } from 'zod';

const advanceSchema = z.object({
  division: z.enum(['1A', 'X', 'SBJ']),
});

interface RunRow {
  id: string;
  position: number;
  status: string;
  registration_id: string;
}

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
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division } = parsed.data;
  const db = getDb();

  const { results: runOrder } = await db
    .prepare('SELECT id, position, status, registration_id FROM vsyc_run_order WHERE division = ?1 ORDER BY position ASC')
    .bind(division)
    .all<RunRow>();

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
    await db
      .prepare("UPDATE vsyc_run_order SET status = 'performing' WHERE id = ?1")
      .bind(first.id)
      .run();

    const nextUp = upcoming[1] ?? null;
    return NextResponse.json(
      { division, now_performing: first.registration_id, next_up: nextUp?.registration_id ?? null },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // Advance atomically: mark current as done, promote next upcoming
  const next = upcoming[0] ?? null;
  const statements = [
    db.prepare("UPDATE vsyc_run_order SET status = 'done' WHERE id = ?1").bind(performing!.id),
  ];
  if (next) {
    statements.push(
      db.prepare("UPDATE vsyc_run_order SET status = 'performing' WHERE id = ?1").bind(next.id)
    );
  }
  await db.batch(statements);

  const nextUp = upcoming[1] ?? null;

  return NextResponse.json(
    {
      division,
      prev_performer: performing!.registration_id,
      now_performing: next?.registration_id ?? null,
      next_up: nextUp?.registration_id ?? null,
      division_complete: next === null,
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
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division } = parsed.data;

  try {
    await getDb()
      .prepare("UPDATE vsyc_run_order SET status = 'upcoming' WHERE division = ?1")
      .bind(division)
      .run();
  } catch (e) {
    console.error('[admin/run-order/advance] reset error:', e);
    return apiError('upstream_error', 'Failed to reset run order', requestId);
  }

  return NextResponse.json(
    { ok: true, division, message: 'Run order reset to upcoming' },
    { headers: { 'x-request-id': requestId } }
  );
});
