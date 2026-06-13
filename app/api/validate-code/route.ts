import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getDb } from '@/lib/db';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'validate-code', 20, 10);
  if (!allowed) return apiError('rate_limited', 'Too many requests', requestId);

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON', requestId);
  }

  const code = typeof (body as Record<string, unknown>).code === 'string'
    ? ((body as Record<string, unknown>).code as string).trim().toUpperCase()
    : '';

  if (!code || code.length > 40) {
    return apiError('bad_request', 'Invalid code', requestId);
  }

  const row = await getDb()
    .prepare('SELECT active, uses_count, max_uses, expires_at FROM vsyc_comp_codes WHERE code = ?1')
    .bind(code)
    .first<{ active: number; uses_count: number; max_uses: number; expires_at: string }>();

  const valid = Boolean(
    row && row.active && row.uses_count < row.max_uses && new Date(row.expires_at) >= new Date()
  );

  return NextResponse.json(
    { valid },
    { headers: { 'x-request-id': requestId } }
  );
});
