import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { volunteerSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { sendVolunteerConfirmationEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVolunteerRole } from '@/lib/volunteer-roles';

async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return await Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * POST /api/volunteer-register
 *
 * Public volunteer application. Anyone can apply for any role — capacity is
 * not enforced at submission time; the event organizer has final discretion
 * on who gets confirmed for which role (see components/VolunteerManager.tsx).
 * A role showing "full" on the public page just means confirmed slots are
 * taken; applicants can still apply and be waitlisted or offered an alternate.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'volunteer-register', 5, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many submissions from this IP. Try again later.', requestId, {
      'Retry-After': '3600',
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = volunteerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const data = parsed.data;

  if ((body as Record<string, unknown>)._hp) {
    return apiError('bad_request', 'Invalid submission', requestId);
  }

  const roleChoice1 = getVolunteerRole(data.role_choice_1);
  if (!roleChoice1) {
    return apiError('bad_request', 'Unknown role selected', requestId);
  }
  const roleChoice2 = data.role_choice_2 ? getVolunteerRole(data.role_choice_2) : undefined;

  const supabase = createAdminClient();

  const { data: volunteer, error: insertError } = await supabase
    .from('vsyc_volunteers')
    .insert({
      first_name:                data.first_name,
      last_name:                 data.last_name,
      email:                     data.email,
      phone:                     data.phone,
      pronouns:                  data.pronouns || null,

      is_18_or_older:            data.is_18_or_older,
      parent_guardian_name:      data.parent_guardian_name || null,
      parent_guardian_email:     data.parent_guardian_email || null,
      parent_guardian_phone:     data.parent_guardian_phone || null,

      role_choice_1:             data.role_choice_1,
      role_choice_2:             data.role_choice_2 || null,
      shift_preference:          data.shift_preference,
      experience_notes:          data.experience_notes || null,

      emergency_contact_name:    data.emergency_contact_name || null,
      emergency_contact_phone:   data.emergency_contact_phone || null,
      photo_video_consent:       data.photo_video_consent ?? false,

      liability_accepted:        data.liability_accepted,
      code_of_conduct_accepted:  data.code_of_conduct_accepted,

      ip_address: ip === 'unknown' ? null : ip,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    .select('id')
    .single();

  if (insertError || !volunteer) {
    console.error('[volunteer-register] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save your application. Please try again.', requestId);
  }

  await logAudit('volunteer_created', {
    actor: 'system',
    details: { volunteer_id: volunteer.id, role_choice_1: data.role_choice_1, role_choice_2: data.role_choice_2 || null },
  });

  await awaitWithTimeout(
    sendVolunteerConfirmationEmail({
      to: data.email,
      firstName: data.first_name,
      volunteerId: volunteer.id,
      roleChoice1Label: roleChoice1.label,
      roleChoice2Label: roleChoice2?.label,
    }),
    2500,
  );

  return NextResponse.json(
    { id: volunteer.id },
    { status: 201, headers: { 'x-request-id': requestId } },
  );
});
