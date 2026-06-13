import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb, DIVISION_CONTAINS_SQL } from '@/lib/db';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof VALID_DIVISIONS[number];

interface RunOrderRow {
  position: number;
  status: string;
  registration_id: string;
  first_name: string;
  last_name: string;
  preferred_bracket_name: string | null;
  city: string | null;
  state: string | null;
  music_filename: string | null;
}

/**
 * GET /api/run-order?division=1A
 *
 * Returns the performance order for a division.
 * Falls back to registration order (by created_at) if no run order has been set.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division') as Division | null;

  if (!division || !VALID_DIVISIONS.includes(division)) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

  const db = getDb();

  // Try explicit run order first
  const { results: runOrder } = await db
    .prepare(
      `SELECT ro.position, ro.status, ro.registration_id,
              r.first_name, r.last_name, r.preferred_bracket_name, r.city, r.state, r.music_filename
       FROM vsyc_run_order ro
       JOIN vsyc_registrations r ON r.id = ro.registration_id
       WHERE ro.division = ?1
       ORDER BY ro.position ASC`
    )
    .bind(division)
    .all<RunOrderRow>();

  if (runOrder.length > 0) {
    const performers = runOrder.map((row) => ({
      position: row.position,
      status: row.status,
      registration_id: row.registration_id,
      display_name: row.preferred_bracket_name ?? `${row.first_name} ${row.last_name}`,
      city: row.city ?? null,
      state: row.state ?? null,
      music_filename: row.music_filename ?? null,
    }));

    return NextResponse.json(
      { division, source: 'run_order', performers },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // Fallback: registration order, only paid registrants in this division
  const { results: regs } = await db
    .prepare(
      `SELECT id AS registration_id, first_name, last_name, preferred_bracket_name, city, state, music_filename
       FROM vsyc_registrations
       WHERE paid = 1 AND ${DIVISION_CONTAINS_SQL}
       ORDER BY created_at ASC`
    )
    .bind(division)
    .all<Omit<RunOrderRow, 'position' | 'status'>>();

  const performers = regs.map((reg, i) => ({
    position: i + 1,
    status: 'upcoming',
    registration_id: reg.registration_id,
    display_name: reg.preferred_bracket_name ?? `${reg.first_name} ${reg.last_name}`,
    city: reg.city ?? null,
    state: reg.state ?? null,
    music_filename: reg.music_filename ?? null,
  }));

  return NextResponse.json(
    { division, source: 'registration_order', performers },
    { headers: { 'x-request-id': requestId } }
  );
});
