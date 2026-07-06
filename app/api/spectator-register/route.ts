import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { spectatorSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { sendSpectatorConfirmationEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  // 1. Rate limit — 5 spectator RSVPs per IP per hour (higher than competitor
  //    registration since it's free and expected to see more casual traffic).
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'spectator-register', 5, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many submissions from this IP. Try again later.', requestId, {
      'Retry-After': '3600',
    });
  }

  // 2. Parse + validate
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = spectatorSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const data = parsed.data;

  // 3. Honeypot check
  if ((body as Record<string, unknown>)._hp) {
    return apiError('bad_request', 'Invalid submission', requestId);
  }

  const supabase = createAdminClient();

  // 4. Insert spectator record
  const { data: spectator, error: insertError } = await supabase
    .from('vsyc_spectators')
    .insert({
      first_name:               data.first_name,
      last_name:                data.last_name,
      nickname:                 data.nickname || null,
      email:                    data.email,
      state:                    data.state,
      photo_url:                data.photo_url || null,
      bio:                      data.bio || null,
      team:                     data.team || null,
      club:                     data.club || null,
      yoyo:                     data.yoyo || null,
      string:                   data.string || null,
      counterweight:            data.counterweight || null,
      socials:                  data.socials ?? {},
      is_public:                data.is_public ?? false,
      liability_accepted:       data.liability_accepted,
      code_of_conduct_accepted: data.code_of_conduct_accepted,
      ip_address:               ip === 'unknown' ? null : ip,
      user_agent:               req.headers.get('user-agent') ?? null,
    })
    .select('id')
    .single();

  if (insertError || !spectator) {
    console.error('[spectator-register] insert error:', insertError);
    return apiError('upstream_error', 'Failed to save RSVP. Please try again.', requestId);
  }

  // 5. Audit (no registration_id — that FK only applies to competitor registrations)
  await logAudit('spectator_created', {
    actor: 'system',
    details: { spectator_id: spectator.id, is_public: data.is_public ?? false },
  });

  // 6. Confirmation email with .ics calendar attachment
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  await sendSpectatorConfirmationEmail({
    to: data.email,
    firstName: data.first_name,
    spectatorId: spectator.id,
    isPublic: data.is_public ?? false,
    portalUrl: `${baseUrl}/spectators/portal`,
  });

  return NextResponse.json(
    { id: spectator.id, is_public: data.is_public ?? false },
    { status: 201, headers: { 'x-request-id': requestId } },
  );
});
