import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { sendVolunteerConfirmedEmail } from '@/lib/email';
import { getVolunteerRole } from '@/lib/volunteer-roles';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

/**
 * POST /api/admin/volunteers/:id/resend-code
 *
 * Re-sends the confirmed-volunteer email with their already-issued comp
 * code — does not generate a new code. For when the first email bounced or
 * got lost. 404s if the volunteer has no code yet (not confirmed, or comp
 * code generation previously failed — patch status again to retry that).
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id) {
    return apiError('bad_request', 'Missing volunteer id', requestId);
  }

  const supabase = createAdminClient();
  const { data: volunteer, error } = await supabase
    .from('vsyc_volunteers')
    .select('email, first_name, comp_code, assigned_role, role_choice_1, shift_preference, status')
    .eq('id', id)
    .single();

  if (error || !volunteer) {
    return apiError('not_found', 'Volunteer not found', requestId);
  }

  if (!volunteer.comp_code) {
    return apiError('bad_request', 'No comp code on file for this volunteer yet — confirm their status first', requestId);
  }

  const { data: compCode, error: codeError } = await supabase
    .from('vsyc_comp_codes')
    .select('discount_percent')
    .eq('code', volunteer.comp_code)
    .single();

  if (codeError || !compCode) {
    return apiError('upstream_error', 'Comp code record is missing', requestId);
  }

  const roleKey = volunteer.assigned_role ?? volunteer.role_choice_1;
  const roleLabel = getVolunteerRole(roleKey)?.label ?? roleKey;

  const result = await sendVolunteerConfirmedEmail({
    to: volunteer.email,
    firstName: volunteer.first_name,
    assignedRoleLabel: roleLabel,
    compCode: volunteer.comp_code,
    discountPercent: compCode.discount_percent,
    shiftPreference: volunteer.shift_preference,
  });

  if (!result.ok) {
    return apiError('upstream_error', `Email failed: ${result.error}`, requestId);
  }

  await logAudit('volunteer_comp_code_resent', {
    actor: 'admin',
    details: { volunteer_id: id, code: volunteer.comp_code },
  });

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
