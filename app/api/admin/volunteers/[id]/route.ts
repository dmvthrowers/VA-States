import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { sendVolunteerConfirmedEmail } from '@/lib/email';
import { VOLUNTEER_ROLE_KEYS, VOLUNTEER_STATUSES, getVolunteerRole } from '@/lib/volunteer-roles';
import { generateReadableCode } from '@/lib/tokens';
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

const VOLUNTEER_COMP_DISCOUNT_PERCENT = 50;
// Covers walk-up-adjacent late confirmations; online checkout closes earlier
// (see registration deadline copy elsewhere), but the code shouldn't expire
// before the event itself.
const VOLUNTEER_COMP_EXPIRES_AT = '2026-09-19T23:59:59-04:00';

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * Creates a single-use 50%-off comp code for a newly confirmed volunteer and
 * links it to their record. Retries a handful of times on the (very rare)
 * chance of a code collision. Returns null on failure — callers treat comp
 * code generation as best-effort so it never blocks the status update itself.
 */
async function createVolunteerCompCode(
  supabase: ReturnType<typeof createAdminClient>,
  volunteerId: string,
  volunteerName: string,
  roleLabel: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `VOL-${generateReadableCode(8)}`;
    const { error: insertError } = await supabase.from('vsyc_comp_codes').insert({
      code,
      description: `Volunteer discount — ${volunteerName} (${roleLabel})`,
      discount_percent: VOLUNTEER_COMP_DISCOUNT_PERCENT,
      max_uses: 1,
      expires_at: VOLUNTEER_COMP_EXPIRES_AT,
      active: true,
    });
    if (!insertError) {
      const { error: linkError } = await supabase
        .from('vsyc_volunteers')
        .update({ comp_code: code })
        .eq('id', volunteerId);
      if (!linkError) return code;
      console.error('[admin/volunteers] failed to link comp code to volunteer:', linkError);
      return null;
    }
    // 23505 = unique_violation — extremely unlikely with 8 random chars, but retry rather than fail outright.
    if (insertError.code !== '23505') {
      console.error('[admin/volunteers] failed to create comp code:', insertError);
      return null;
    }
  }
  console.error('[admin/volunteers] exhausted retries generating a unique comp code');
  return null;
}

/**
 * PATCH /api/admin/volunteers/:id
 *
 * Confirm/decline/waitlist an applicant, assign their day-of role (the event
 * organizer's call — may differ from their stated preferences), and track
 * pay for core roles. Admin-only.
 *
 * On the first transition into status='confirmed', auto-generates a
 * single-use 50%-off comp code (vsyc_comp_codes) for the volunteer's own
 * VSYC-26 entry and emails it to them. Re-confirming (already confirmed,
 * code already issued) does not regenerate or re-send.
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

  const { data: before, error: beforeError } = await supabase
    .from('vsyc_volunteers')
    .select('status, comp_code, email, first_name, last_name, role_choice_1, assigned_role, shift_preference')
    .eq('id', id)
    .single();

  if (beforeError || !before) {
    return apiError('not_found', 'Volunteer not found', requestId);
  }

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

  const justConfirmed = before.status !== 'confirmed' && updated.status === 'confirmed';
  if (justConfirmed && !before.comp_code) {
    const roleKey = updated.assigned_role ?? before.role_choice_1;
    const roleLabel = getVolunteerRole(roleKey)?.label ?? roleKey;
    const volunteerName = `${before.first_name} ${before.last_name}`;

    const code = await createVolunteerCompCode(supabase, id, volunteerName, roleLabel);
    if (code) {
      updated.comp_code = code;
      await logAudit('volunteer_comp_code_issued', {
        actor: 'admin',
        details: { volunteer_id: id, code, discount_percent: VOLUNTEER_COMP_DISCOUNT_PERCENT },
      });
      await awaitWithTimeout(
        sendVolunteerConfirmedEmail({
          to: before.email,
          firstName: before.first_name,
          assignedRoleLabel: roleLabel,
          compCode: code,
          discountPercent: VOLUNTEER_COMP_DISCOUNT_PERCENT,
          shiftPreference: before.shift_preference,
        }),
        2500,
      );
    }
  }

  return NextResponse.json({ volunteer: updated }, { headers: { 'x-request-id': requestId } });
});
