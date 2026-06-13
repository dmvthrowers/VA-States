import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'confirm', 30, 10);
  if (!allowed) return apiError('rate_limited', 'Too many requests', requestId);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return apiError('bad_request', 'Missing id', requestId);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, email, divisions, fee_cents, music_upload_token, music_uploaded_at, paid')
    .eq('id', id)
    .single();

  if (error || !data) return apiError('not_found', 'Registration not found', requestId);

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  const musicDeadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');

  return NextResponse.json(
    {
      id: data.id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      divisions: data.divisions,
      fee_cents: data.fee_cents,
      paid: data.paid,
      music_upload_url: `${BASE_URL}/upload?token=${data.music_upload_token}`,
      music_deadline: musicDeadline.toISOString(),
    },
    { headers: { 'x-request-id': requestId } },
  );
});
