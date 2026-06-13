import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb, DIVISION_CONTAINS_SQL } from '@/lib/db';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;

const saveRunOrderSchema = z.object({
  division: z.enum(['1A', 'X', 'SBJ']),
  /** Ordered array of registration IDs — determines position 1, 2, 3… */
  registration_ids: z.array(z.string().uuid()).min(1).max(200),
});

interface DivisionReg {
  id: string;
  divisions: string;
  paid: number;
  first_name: string;
  last_name: string;
  preferred_bracket_name: string | null;
  city: string | null;
  state: string | null;
  performance_time_pref: string | null;
  scheduling_notes: string | null;
  music_filename: string | null;
}

/**
 * POST /api/admin/run-order
 *
 * Saves the full run order for a division: deletes the existing order and
 * inserts the new one in a single atomic D1 batch (no partial state if a
 * statement fails). Preserves status for rows that already exist; new rows
 * start as 'upcoming'.
 *
 * Body: { division: "1A", registration_ids: ["uuid1", "uuid2", ...] }
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = saveRunOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division, registration_ids } = parsed.data;
  const db = getDb();

  // Verify all registration IDs are paid + in this division
  const { results: divisionRegs } = await db
    .prepare(`SELECT id, divisions, paid FROM vsyc_registrations WHERE ${DIVISION_CONTAINS_SQL}`)
    .bind(division)
    .all<Pick<DivisionReg, 'id' | 'divisions' | 'paid'>>();

  const regMap = new Map(divisionRegs.map((r) => [r.id, r]));

  for (const id of registration_ids) {
    const reg = regMap.get(id);
    if (!reg) return apiError('bad_request', `Registration ${id} not found in division ${division}`, requestId);
    if (!reg.paid) return apiError('unprocessable', `Registration ${id} has not paid`, requestId);
  }

  // Fetch existing statuses so we can preserve them across the rewrite
  const { results: existing } = await db
    .prepare('SELECT registration_id, status FROM vsyc_run_order WHERE division = ?1')
    .bind(division)
    .all<{ registration_id: string; status: string }>();

  const existingStatusMap = new Map(existing.map((r) => [r.registration_id, r.status]));

  // Atomic rewrite: delete + chunked inserts in one transaction
  const insertSql =
    'INSERT INTO vsyc_run_order (id, division, registration_id, position, status) VALUES (?,?,?,?,?)';
  const statements = [
    db.prepare('DELETE FROM vsyc_run_order WHERE division = ?1').bind(division),
    ...registration_ids.map((rid, i) =>
      db.prepare(insertSql).bind(
        crypto.randomUUID(),
        division,
        rid,
        i + 1,
        existingStatusMap.get(rid) ?? 'upcoming',
      )
    ),
  ];

  try {
    await db.batch(statements);
  } catch (e) {
    console.error('[admin/run-order] batch error:', e);
    return apiError('upstream_error', 'Failed to save run order', requestId);
  }

  return NextResponse.json(
    { ok: true, division, count: registration_ids.length },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});

/**
 * GET /api/admin/run-order?division=1A
 *
 * Returns full run order rows with registration details for admin view.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division');

  if (!division || !VALID_DIVISIONS.includes(division as typeof VALID_DIVISIONS[number])) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

  const db = getDb();

  // All registrants in this division (for the "available to add" list)
  const { results: allRegs } = await db
    .prepare(
      `SELECT id, divisions, paid, first_name, last_name, preferred_bracket_name, city, state,
              performance_time_pref, scheduling_notes, music_filename
       FROM vsyc_registrations
       WHERE ${DIVISION_CONTAINS_SQL}
       ORDER BY created_at ASC`
    )
    .bind(division)
    .all<DivisionReg>();

  // Current run order
  const { results: runOrder } = await db
    .prepare('SELECT position, status, registration_id FROM vsyc_run_order WHERE division = ?1 ORDER BY position ASC')
    .bind(division)
    .all<{ position: number; status: string; registration_id: string }>();

  const orderedIds = new Set(runOrder.map((r) => r.registration_id));
  const regMap = new Map(allRegs.map((r) => [r.id, r]));

  const ordered = runOrder.map((row) => {
    const reg = regMap.get(row.registration_id);
    return {
      position: row.position,
      status: row.status,
      registration_id: row.registration_id,
      display_name: reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
      city: reg?.city ?? null,
      state: reg?.state ?? null,
      performance_time_pref: reg?.performance_time_pref ?? null,
      scheduling_notes: reg?.scheduling_notes ?? null,
      music_filename: reg?.music_filename ?? null,
      paid: Boolean(reg?.paid),
    };
  });

  const unscheduled = allRegs
    .filter((r) => !orderedIds.has(r.id))
    .map((r) => ({
      registration_id: r.id,
      display_name: r.preferred_bracket_name ?? `${r.first_name} ${r.last_name}`,
      city: r.city ?? null,
      state: r.state ?? null,
      performance_time_pref: r.performance_time_pref ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      music_filename: r.music_filename ?? null,
      paid: Boolean(r.paid),
    }));

  return NextResponse.json(
    { division, ordered, unscheduled },
    { headers: { 'x-request-id': requestId } }
  );
});
