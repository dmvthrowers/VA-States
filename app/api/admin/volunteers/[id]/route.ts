import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { VOLUNTEER_ROLE_KEYS, VOLUNTEER_STATUSES } from '@/lib/volunteer-roles';
import { z } from 'zod';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

const updateVolunteerSchema = z.object({
  status:            z.enum(VOLUNTEER_STATUSES).optional(),
  assigned_role:     z.enum(VOLUNTEER_ROLE_KEYS).optional().or(z.literal('')),
  is_paid_role:      z.boolean().optional(),
  honorarium_cents:  z.number().int().min(0).max(100000).optional().or(z.literal(null)),
  admin_notes:       z.string().trim().max(2000).optional().or(z.literal('')),
}).strict();

/**
 * PATCH /api/admin/volunteers/:id
 *
 * Confirm/decline/waitlist an applicant, assign their day-of role (the event
 * organizer's call — may differ from their stated preferences), and track
 * pay for core roles. Admin-only.
 */
export const PATCH = withErrorHandling(async (requestId, req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id) {
    return apiError('bad_request', 'Missing volunteer id', requestId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = updateVolunteerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const updatePayload = parsed.data;
  if (Object.keys(updatePayload).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const normalized: Record<string, unknown> = { ...updatePayload };
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'assigned_role')) {
    normalized.assigned_role = updatePayload.assigned_role || null;
  }
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'admin_notes')) {
    normalized.admin_notes = updatePayload.admin_notes || null;
  }
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'honorarium_cents')) {
    normalized.honorarium_cents = updatePayload.honorarium_cents ?? null;
  }

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from('vsyc_volunteers')
    .update(normalized)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !updated) {
    return apiError('upstream_error', 'Update failed', requestId);
  }

  await logAudit('volunteer_updated', {
    actor: 'admin',
    details: { volunteer_id: id, ...normalized },
  });

  return NextResponse.json({ volunteer: updated }, { headers: { 'x-request-id': requestId } });
});
