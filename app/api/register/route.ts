import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { registrationSchema } from '@/lib/validation';
import { calculateFee } from '@/lib/pricing';
import { generateToken } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';
import { sendConfirmationEmail } from '@/lib/email';
import { getDb } from '@/lib/db';
import type { Division, RegistrationSource } from '@/lib/pricing';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  // 1. Rate limit — 3 registrations per IP per hour
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'register', 3, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many registrations from this IP. Try again later.', requestId, {
      'Retry-After': '3600',
    });
  }

  // 2. Parse + validate
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const data = parsed.data;

  // 3. Honeypot check
  if ((body as Record<string, unknown>)._hp) {
    return apiError('bad_request', 'Invalid submission', requestId);
  }

  // 4. Online registration window check
  const now = new Date();
  const onlineCutoff = new Date(process.env.ONLINE_REG_CUTOFF_ISO ?? '2026-09-13T23:59:59-04:00');
  if (now > onlineCutoff) {
    return apiError('unprocessable', 'Online registration has closed. Contact dmvthrowers@gmail.com for late entry.', requestId);
  }

  const db = getDb();

  // 5. Atomically claim the comp code — validates and increments in one
  //    statement, so the usage cap can't be exceeded by concurrent requests
  let compCodeValid = false;
  if (data.comp_code) {
    const claimed = await db
      .prepare(
        `UPDATE vsyc_comp_codes
         SET uses_count = uses_count + 1
         WHERE code = ?1 AND active = 1 AND uses_count < max_uses AND expires_at >= ?2
         RETURNING code`
      )
      .bind(data.comp_code, now.toISOString())
      .first<{ code: string }>();

    if (!claimed) {
      return apiError('unprocessable', 'Comp code is invalid, expired, or has reached its usage limit.', requestId);
    }
    compCodeValid = true;
  }

  // 6. Calculate fee
  const source: RegistrationSource = 'online';
  const feeResult = calculateFee(data.divisions as Division[], compCodeValid, now, source);

  // 7. Generate music upload token (expires Sept 12 23:59 ET)
  const musicUploadToken = generateToken(32);
  const musicDeadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');

  // 8. Insert registration
  const regId = crypto.randomUUID();
  const merchTotal = (data.merch_order ?? []).reduce((s, i) => s + i.price_cents * i.qty, 0);

  try {
    await db
      .prepare(
        `INSERT INTO vsyc_registrations (
          id, first_name, last_name, preferred_bracket_name, age_on_event, pronouns,
          email, phone, city, state, club_affiliation,
          parent_name, parent_email, parent_consented,
          divisions, x_substyle, combo_applied,
          comp_code, early_bird_applied, walk_up_surcharge, fee_cents, registration_source,
          music_upload_token,
          liability_waiver_accepted, photo_video_consent, code_of_conduct_accepted,
          emergency_contact_name, emergency_contact_phone, volunteer_interest, accessibility_needs,
          performance_time_pref, scheduling_notes, merch_order, merch_total_cents,
          ip_address, user_agent
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        regId,
        data.first_name,
        data.last_name,
        data.preferred_bracket_name || null,
        data.age_on_event,
        data.pronouns || null,
        data.email,
        data.phone,
        data.city,
        data.state,
        data.club_affiliation || null,
        data.parent_name || null,
        data.parent_email || null,
        data.parent_consented ? 1 : 0,
        JSON.stringify(data.divisions),
        data.x_substyle ?? null,
        feeResult.combo_applied ? 1 : 0,
        data.comp_code || null,
        feeResult.early_bird_applied ? 1 : 0,
        feeResult.walk_up_surcharge ? 1 : 0,
        feeResult.fee_cents,
        source,
        musicUploadToken,
        1, 1, 1, // waivers — zod schema guarantees all are literal(true)
        data.emergency_contact_name || null,
        data.emergency_contact_phone || null,
        data.volunteer_interest ? 1 : 0,
        data.accessibility_needs || null,
        data.performance_time_pref || null,
        data.scheduling_notes || null,
        data.merch_order ? JSON.stringify(data.merch_order) : null,
        merchTotal,
        ip === 'unknown' ? null : ip,
        req.headers.get('user-agent') ?? null,
      )
      .run();
  } catch (insertError) {
    console.error('[register] insert error:', insertError);
    // Release the comp-code use claimed above
    if (data.comp_code && compCodeValid) {
      await db
        .prepare('UPDATE vsyc_comp_codes SET uses_count = uses_count - 1 WHERE code = ?1 AND uses_count > 0')
        .bind(data.comp_code)
        .run()
        .catch((e) => console.error('[register] comp code rollback failed:', e));
    }
    return apiError('upstream_error', 'Failed to save registration. Please try again.', requestId);
  }

  // 9. Audit
  await logAudit('created', {
    registrationId: regId,
    actor: 'system',
    details: { source, fee_cents: feeResult.fee_cents, divisions: data.divisions },
  });

  // 10. Send confirmation email
  const confirmUrl = `${BASE_URL}/confirm?id=${regId}`;
  const musicUploadUrl = `${BASE_URL}/upload?token=${musicUploadToken}`;

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

  // Copy parent if minor
  if (data.age_on_event < 18 && data.parent_email) {
    await sendConfirmationEmail({
      to: data.parent_email,
      firstName: data.first_name,
      lastName: data.last_name,
      divisions: data.divisions,
      feeCents: feeResult.fee_cents,
      isComp: feeResult.is_comp,
      confirmUrl,
      musicUploadUrl,
      registrationId: regId,
    });
  }

  return NextResponse.json(
    {
      id: regId,
      fee_cents: feeResult.fee_cents,
      is_comp: feeResult.is_comp,
      payment_instructions: {
        venmo: '@DMVThrow',
        paypal: 'paypal.biz/Dmvthrowers',
        check_payable_to: 'DMV Throwers',
        note_format: `VSYC26-${data.last_name}-${data.first_name}`,
      },
      music_upload_url: musicUploadUrl,
      music_deadline: musicDeadline.toISOString(),
      confirm_url: confirmUrl,
    },
    { status: 201, headers: { 'x-request-id': requestId } }
  );
});
