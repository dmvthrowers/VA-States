import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateFee } from '@/lib/pricing';
import { generateToken } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';
import { sendConfirmationEmail } from '@/lib/email';
import { z } from 'zod';
import type { Division } from '@/lib/pricing';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/**
 * Simplified walk-up registration schema.
 * No comp code, no scheduling prefs, no merch — streamlined for day-of check-in.
 * Walk-up surcharge (+$10) is applied automatically.
 */
const walkUpSchema = z.object({
  first_name:                z.string().trim().min(1).max(60),
  last_name:                 z.string().trim().min(1).max(60),
  preferred_bracket_name:    z.string().trim().max(60).optional(),
  age_on_event:              z.number().int().min(5).max(99),
  email:                     z.string().trim().email().max(254),
  phone:                     z.string().trim().max(30).optional(),
  city:                      z.string().trim().min(1).max(80),
  state:                     z.string().trim().length(2),
  divisions:                 z.array(z.enum(['1A', 'X', 'SBJ'])).min(1).max(3),
  x_substyle:                z.enum(['2A', '3A', '4A', '5A']).optional(),
  parent_name:               z.string().trim().max(120).optional(),
  parent_email:              z.string().trim().email().max(254).optional(),
  parent_consented:          z.boolean().default(false),
  liability_waiver_accepted: z.literal(true, { errorMap: () => ({ message: 'Waiver must be accepted' }) }),
  code_of_conduct_accepted:  z.literal(true, { errorMap: () => ({ message: 'Code of conduct must be accepted' }) }),
  /** If true, marks this as paid immediately (cash collected at table) */
  paid_at_table:             z.boolean().default(false),
});

/**
 * POST /api/admin/walk-up
 *
 * Creates a walk-up registration. No rate limiting (admin-only endpoint).
 * Automatically applies walk_up_surcharge (+$10).
 * Skips the online registration window check.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = walkUpSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const data = parsed.data;
  const supabase = createAdminClient();

  // Calculate fee with walk_up source (auto-applies $10 surcharge)
  const feeResult = calculateFee(
    data.divisions as Division[],
    false, // no comp codes for walk-ups
    new Date(),
    'walk_up'
  );

  // Generate music token (same as online flow)
  const musicUploadToken = generateToken(32);
  const musicDeadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');

  const { data: reg, error: insertError } = await supabase
    .from('vsyc_registrations')
    .insert({
      first_name:               data.first_name,
      last_name:                data.last_name,
      preferred_bracket_name:   data.preferred_bracket_name || null,
      age_on_event:             data.age_on_event,
      pronouns:                 null,
      email:                    data.email,
      phone:                    data.phone || null,
      city:                     data.city,
      state:                    data.state,
      club_affiliation:         null,
      parent_name:              data.parent_name || null,
      parent_email:             data.parent_email || null,
      parent_consented:         data.parent_consented,
      divisions:                data.divisions,
      x_substyle:               data.x_substyle ?? null,
      combo_applied:            feeResult.combo_applied,
      comp_code:                null,
      early_bird_applied:       feeResult.early_bird_applied,
      walk_up_surcharge:        true,
      fee_cents:                feeResult.fee_cents,
      registration_source:      'walk_up',
      music_upload_token:       musicUploadToken,
      liability_waiver_accepted: data.liability_waiver_accepted,
      photo_video_consent:       true,   // assumed at walk-up
      code_of_conduct_accepted:  data.code_of_conduct_accepted,
      emergency_contact_name:    null,
      emergency_contact_phone:   null,
      volunteer_interest:        false,
      accessibility_needs:       null,
      performance_time_pref:     null,
      scheduling_notes:          null,
      merch_order:               null,
      merch_total_cents:         0,
      paid:                      data.paid_at_table,
      ip_address:                null,
      user_agent:                'admin/walk-up',
    })
    .select('id')
    .single();

  if (insertError || !reg) {
    console.error('[admin/walk-up] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save walk-up registration', requestId);
  }

  await logAudit('created', {
    registrationId: reg.id,
    actor: 'admin/walk-up',
    details: {
      source: 'walk_up',
      fee_cents: feeResult.fee_cents,
      divisions: data.divisions,
      paid_at_table: data.paid_at_table,
    },
  });

  // Send confirmation email (best-effort — don't block on failure)
  const confirmUrl = `${BASE_URL}/confirm?id=${reg.id}`;
  const musicUploadUrl = `${BASE_URL}/upload?token=${musicUploadToken}`;

  try {
    await sendConfirmationEmail({
      to: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      divisions: data.divisions,
      feeCents: feeResult.fee_cents,
      isComp: feeResult.is_comp,
      confirmUrl,
      musicUploadUrl,
      registrationId: reg.id,
    });
  } catch (emailErr) {
    console.error('[admin/walk-up] email error (non-fatal):', emailErr);
  }

  return NextResponse.json(
    {
      id: reg.id,
      registration_source: 'walk_up',
      fee_cents: feeResult.fee_cents,
      walk_up_surcharge: true,
      paid: data.paid_at_table,
      music_upload_url: musicUploadUrl,
      music_deadline: musicDeadline.toISOString(),
      confirm_url: confirmUrl,
      payment_note: `VSYC26-${data.last_name.toUpperCase()}-${data.first_name.toUpperCase()}`,
    },
    { status: 201, headers: { 'x-request-id': requestId } }
  );
});
