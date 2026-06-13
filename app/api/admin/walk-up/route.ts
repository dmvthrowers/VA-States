import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getDb } from '@/lib/db';
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
 * Creates a walk-up registration. Behind admin Basic Auth (middleware).
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

  const regId = crypto.randomUUID();
  try {
    await getDb()
      .prepare(
        `INSERT INTO vsyc_registrations (
          id, first_name, last_name, preferred_bracket_name, age_on_event,
          email, phone, city, state,
          parent_name, parent_email, parent_consented,
          divisions, x_substyle, combo_applied,
          early_bird_applied, walk_up_surcharge, fee_cents, registration_source,
          music_upload_token,
          liability_waiver_accepted, photo_video_consent, code_of_conduct_accepted,
          volunteer_interest, merch_total_cents, paid, paid_at, payment_method, user_agent
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        regId,
        data.first_name,
        data.last_name,
        data.preferred_bracket_name || null,
        data.age_on_event,
        data.email,
        data.phone || null,
        data.city,
        data.state,
        data.parent_name || null,
        data.parent_email || null,
        data.parent_consented ? 1 : 0,
        JSON.stringify(data.divisions),
        data.x_substyle ?? null,
        feeResult.combo_applied ? 1 : 0,
        feeResult.early_bird_applied ? 1 : 0,
        1, // walk_up_surcharge
        feeResult.fee_cents,
        'walk_up',
        musicUploadToken,
        1, // liability_waiver_accepted
        1, // photo_video_consent — assumed at walk-up
        1, // code_of_conduct_accepted
        0, // volunteer_interest
        0, // merch_total_cents
        data.paid_at_table ? 1 : 0,
        data.paid_at_table ? new Date().toISOString() : null,
        data.paid_at_table ? 'cash' : 'pending',
        'admin/walk-up',
      )
      .run();
  } catch (insertError) {
    console.error('[admin/walk-up] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save walk-up registration', requestId);
  }

  await logAudit('created', {
    registrationId: regId,
    actor: 'admin/walk-up',
    details: {
      source: 'walk_up',
      fee_cents: feeResult.fee_cents,
      divisions: data.divisions,
      paid_at_table: data.paid_at_table,
    },
  });

  // Send confirmation email (best-effort — don't block on failure)
  const confirmUrl = `${BASE_URL}/confirm?id=${regId}`;
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
      registrationId: regId,
    });
  } catch (emailErr) {
    console.error('[admin/walk-up] email error (non-fatal):', emailErr);
  }

  return NextResponse.json(
    {
      id: regId,
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
