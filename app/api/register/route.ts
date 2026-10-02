import { NextRequest, NextResponse, after } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { isCodeLocked, recordFailedCodeAttempt } from '@/lib/comp-code-guard';
import { registrationSchema } from '@/lib/validation';
import { calculateFee } from '@/lib/pricing';
import { generateToken } from '@/lib/tokens';
import { logAudit } from '@/lib/audit';
import { sendConfirmationEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEventFlagBoolean } from '@/lib/event-flags';
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
  const onlineRegistrationOpen = await getEventFlagBoolean('online_registration_open', true);
  if (!onlineRegistrationOpen) {
    return apiError('unprocessable', 'Online registration is currently paused. Please try again later.', requestId);
  }
  const onlineCutoff = new Date(process.env.ONLINE_REG_CUTOFF_ISO ?? '2026-09-17T23:59:59-04:00');
  if (now > onlineCutoff) {
    return apiError('unprocessable', 'Online registration has closed. Contact contact@dmvthrowers.club for late entry.', requestId);
  }

  const supabase = createAdminClient();

  // 5. Comp code validation
  let compDiscountPercent = 0;
  let compCodeRedeemed = false;
  if (data.comp_code) {
    if (await isCodeLocked(data.comp_code)) {
      return apiError('unprocessable', 'Comp code is invalid, expired, or has reached its usage limit.', requestId);
    }

    // Claims one use atomically (only while active, unexpired and under
    // max_uses), so two registrations can't both take a code's last use.
    // Released below if the registration insert fails.
    const { data: discount, error } = await supabase.rpc('redeem_comp_code', { p_code: data.comp_code });

    if (error || discount === null || discount === undefined) {
      await recordFailedCodeAttempt(data.comp_code);
      await logAudit('comp_code_invalid_attempt', { actor: 'anonymous', details: { ip, code: data.comp_code, via: 'register' } });
      return apiError('unprocessable', 'Comp code is invalid, expired, or has reached its usage limit.', requestId);
    }
    compDiscountPercent = discount as number;
    compCodeRedeemed = true;
  }

  // 6. Calculate fee
  const source: RegistrationSource = 'online';
  const feeResult = calculateFee(data.divisions as Division[], compDiscountPercent, now, source);
  const xSubstyles = data.x_substyles?.length ? data.x_substyles.join(', ') : null;

  // 7. Generate music upload token (expires Sept 17 23:59 ET)
  const musicUploadToken = generateToken(32);
  const musicDeadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-17T23:59:59-04:00');

  // Minors are private-by-default and don't get public-profile fields stored,
  // regardless of what the client sent — enforced server-side so it can't be
  // bypassed by a hand-crafted request.
  const isMinor = data.age_on_event < 18;

  // 8. Insert registration
  const { data: reg, error: insertError } = await supabase
    .from('vsyc_registrations')
    .insert({
      first_name:               data.first_name,
      last_name:                data.last_name,
      preferred_bracket_name:   data.preferred_bracket_name || null,
      age_on_event:             data.age_on_event,
      pronouns:                 data.pronouns || null,
      email:                    data.email,
      phone:                    data.phone,
      city:                     data.city,
      state:                    data.state,
      club_affiliation:         data.club_affiliation || null,
      parent_name:              data.parent_name || null,
      parent_email:             data.parent_email || null,
      parent_consented:         data.parent_consented ?? false,
      divisions:                data.divisions,
      x_substyle:               xSubstyles,
      combo_applied:            feeResult.combo_applied,
      comp_code:                data.comp_code || null,
      early_bird_applied:       feeResult.early_bird_applied,
      walk_up_surcharge:        feeResult.walk_up_surcharge,
      fee_cents:                feeResult.fee_cents,
      registration_source:      source,
      music_upload_token:       musicUploadToken,
      nickname:                 isMinor ? null : (data.nickname || null),
      photo_url:                isMinor ? null : (data.photo_url || null),
      bio:                      isMinor ? null : (data.bio || null),
      team:                     isMinor ? null : (data.team || null),
      yoyo:                     data.yoyo || null,
      string:                   data.string || null,
      counterweight:            data.counterweight || null,
      socials:                  isMinor ? {} : (data.socials ?? {}),
      is_public:                isMinor ? false : (data.is_public ?? false),
      liability_waiver_accepted: data.liability_waiver_accepted,
      photo_video_consent:       data.photo_video_consent,
      code_of_conduct_accepted:  data.code_of_conduct_accepted,
      emergency_contact_name:         data.emergency_contact_name,
      emergency_contact_phone:        data.emergency_contact_phone,
      emergency_contact_relationship: data.emergency_contact_relationship,
      volunteer_interest:        data.volunteer_interest ?? false,
      accessibility_needs:       data.accessibility_needs || null,
      performance_time_pref:     data.performance_time_pref || null,
      scheduling_notes:          data.scheduling_notes || null,
      merch_order:               data.merch_order ?? null,
      merch_total_cents:         (data.merch_order ?? []).reduce((s, i) => s + i.price_cents * i.qty, 0),
      ip_address:                ip === 'unknown' ? null : ip,
      user_agent:                req.headers.get('user-agent') ?? null,
    })
    .select('id')
    .single();

  if (insertError || !reg) {
    console.error('[register] insert error:', insertError);
    if (compCodeRedeemed && data.comp_code) {
      await supabase.rpc('release_comp_code', { p_code: data.comp_code });
    }
    return apiError('upstream_error', 'Failed to save registration. Please try again.', requestId);
  }

  // 9. Audit (the comp code use was already claimed in step 5)
  const compCodeValid = compCodeRedeemed;
  await logAudit('created', {
    registrationId: reg.id,
    actor: 'system',
    details: { source, fee_cents: feeResult.fee_cents, divisions: data.divisions, comp_code: compCodeValid ? data.comp_code : null },
  });

  // 10. Confirmation email. It goes through the outbox (stored, then sent;
  // retried later if Resend is slow or the daily limit is hit), and after()
  // lets it finish once the response is out so the registrant isn't kept waiting.
  const confirmUrl = `${BASE_URL}/confirm?id=${reg.id}`;
  const musicUploadUrl = `${BASE_URL}/upload?token=${musicUploadToken}`;

  const emailJobs: Array<() => Promise<unknown>> = [
    () => sendConfirmationEmail({
      to: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      divisions: data.divisions,
      feeCents: feeResult.fee_cents,
      isComp: feeResult.is_comp,
      confirmUrl,
      musicUploadUrl,
      registrationId: reg.id,
    }, { dedupeKey: `confirmation:${reg.id}:${data.email.toLowerCase()}` }),
  ];

  // BCC parent if minor
  if (data.age_on_event < 18 && data.parent_email) {
    const parentEmail = data.parent_email;
    emailJobs.push(
      () => sendConfirmationEmail({
        to: parentEmail,
        firstName: data.first_name,
        lastName: data.last_name,
        divisions: data.divisions,
        feeCents: feeResult.fee_cents,
        isComp: feeResult.is_comp,
        confirmUrl,
        musicUploadUrl,
        registrationId: reg.id,
      }, { dedupeKey: `confirmation:${reg.id}:${parentEmail.toLowerCase()}` })
    );
  }

  after(async () => {
    await Promise.allSettled(emailJobs.map((job) => job()));
  });

  return NextResponse.json(
    {
      id: reg.id,
      fee_cents: feeResult.fee_cents,
      is_comp: feeResult.is_comp,
      payment_instructions: {
        online_processor: 'Stripe',
        payment_portal: BASE_URL,
        day_of_info: 'See registration desk for available day-of alternatives.',
      },
      music_upload_url: musicUploadUrl,
      music_deadline: musicDeadline.toISOString(),
      confirm_url: confirmUrl,
    },
    { status: 201, headers: { 'x-request-id': requestId } }
  );
});
