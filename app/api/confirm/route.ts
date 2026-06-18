import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getDb, parseDivisions } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ConfirmRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  divisions: string;
  fee_cents: number;
  music_upload_token: string;
  paid: number;
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'confirm', 30, 10);
  if (!allowed) return apiError('rate_limited', 'Too many requests', requestId);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return apiError('bad_request', 'Missing id', requestId);

  const row = await getDb()
    .prepare(
      `SELECT id, first_name, last_name, email, divisions, fee_cents, music_upload_token, paid
       FROM vsyc_registrations WHERE id = ?1`
    )
    .bind(id)
    .first<ConfirmRow>();

  if (!row) return apiError('not_found', 'Registration not found', requestId);

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
  const musicDeadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');

  return NextResponse.json(
    {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      divisions: parseDivisions(row.divisions),
      fee_cents: row.fee_cents,
      paid: Boolean(row.paid),
      music_upload_url: `${BASE_URL}/upload?token=${row.music_upload_token}`,
      music_deadline: musicDeadline.toISOString(),
    },
    { headers: { 'x-request-id': requestId } },
  );
});
