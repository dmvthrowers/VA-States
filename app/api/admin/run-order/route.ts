import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { z } from 'zod';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;

const saveRunOrderSchema = z.object({
  division: z.enum(['1A', 'X', 'SBJ']),
  /** Ordered array of registration IDs — determines position 1, 2, 3… */
  registration_ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * POST /api/admin/run-order
 *
 * Saves (upserts) the full run order for a division.
 * Completely replaces any existing order for that division.
 * Preserves status for rows that already exist; new rows start as 'upcoming'.
 *
 * Body: { division: "1A", registration_ids: ["uuid1", "uuid2", ...] }
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = saveRunOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const { division, registration_ids } = parsed.data;
  const supabase = createAdminClient();

  // Verify all registration IDs are paid + in this division
  const { data: regs, error: regsError } = await supabase
    .from('vsyc_registrations')
    .select('id, divisions, paid')
    .in('id', registration_ids);

  if (regsError) {
    return apiError('upstream_error', 'Failed to validate registrations', requestId);
  }

  const regMap = new Map((regs ?? []).map((r) => [r.id, r]));

  for (const id of registration_ids) {
    const reg = regMap.get(id);
    if (!reg) return apiError('bad_request', `Registration ${id} not found`, requestId);
    if (!reg.paid) return apiError('unprocessable', `Registration ${id} has not paid`, requestId);
    if (!(reg.divisions as string[]).includes(division)) {
      return apiError('unprocessable', `Registration ${id} is not in division ${division}`, requestId);
    }
  }

  // Fetch existing statuses so we can preserve them on upsert
  const { data: existing } = await supabase
    .from('vsyc_run_order')
    .select('registration_id, status')
    .eq('division', division);

  const existingStatusMap = new Map((existing ?? []).map((r) => [r.registration_id, r.status]));

  // Build upsert rows
  const rows = registration_ids.map((rid, i) => ({
    division,
    registration_id: rid,
    position: i + 1,
    status: existingStatusMap.get(rid) ?? 'upcoming',
  }));

  // Delete old rows for this division, then insert new order
  const { error: deleteError } = await supabase
    .from('vsyc_run_order')
    .delete()
    .eq('division', division);

  if (deleteError) {
    return apiError('upstream_error', 'Failed to clear existing run order', requestId);
  }

  const { error: insertError } = await supabase
    .from('vsyc_run_order')
    .insert(rows);

  if (insertError) {
    console.error('[admin/run-order] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save run order', requestId);
  }

  return NextResponse.json(
    { ok: true, division, count: rows.length },
    { status: 200, headers: { 'x-request-id': requestId } }
  );
});

/**
 * GET /api/admin/run-order?division=1A
 *
 * Returns full run order rows with registration details for admin view.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const division = req.nextUrl.searchParams.get('division');

  if (!division || !VALID_DIVISIONS.includes(division as typeof VALID_DIVISIONS[number])) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

  const supabase = createAdminClient();

  // Get all paid registrants in this division (for the "available to add" list)
  const { data: allRegs, error: allRegsError } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, city, state, performance_time_pref, scheduling_notes, music_filename, paid')
    .contains('divisions', [division])
    .order('created_at', { ascending: true });

  if (allRegsError) {
    return apiError('upstream_error', 'Failed to fetch registrations', requestId);
  }

  // Get current run order
  const { data: runOrder, error: roError } = await supabase
    .from('vsyc_run_order')
    .select('position, status, registration_id')
    .eq('division', division)
    .order('position', { ascending: true });

  if (roError) {
    return apiError('upstream_error', 'Failed to fetch run order', requestId);
  }

  const orderedIds = new Set((runOrder ?? []).map((r) => r.registration_id));
  const regMap = new Map((allRegs ?? []).map((r) => [r.id, r]));

  const ordered = (runOrder ?? []).map((row) => {
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
      paid: reg?.paid ?? false,
    };
  });

  const unscheduled = (allRegs ?? [])
    .filter((r) => !orderedIds.has(r.id))
    .map((r) => ({
      registration_id: r.id,
      display_name: r.preferred_bracket_name ?? `${r.first_name} ${r.last_name}`,
      city: r.city ?? null,
      state: r.state ?? null,
      performance_time_pref: r.performance_time_pref ?? null,
      scheduling_notes: r.scheduling_notes ?? null,
      music_filename: r.music_filename ?? null,
      paid: r.paid,
    }));

  return NextResponse.json(
    { division, ordered, unscheduled },
    { headers: { 'x-request-id': requestId } }
  );
});
