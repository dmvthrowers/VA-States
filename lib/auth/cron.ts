import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { requireAdminRequest } from '@/lib/auth/admin-request';

function timingSafeEq(a: string, b: string): boolean {
  const ta = Buffer.from(a);
  const tb = Buffer.from(b);
  const len = Math.max(ta.length, tb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ta.copy(pa);
  tb.copy(pb);
  return crypto.timingSafeEqual(pa, pb) && ta.length === tb.length;
}

/**
 * Scheduled jobs (Vercel cron, Supabase pg_cron) send `Authorization: Bearer
 * $CRON_SECRET`; an admin can run the same route with their staff token.
 * Returns an error response, or null when allowed. Fails closed when
 * CRON_SECRET is unset and the token isn't an admin's.
 */
export async function requireCronOrAdmin(req: NextRequest, requestId: string): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET ?? '';
  if (bearer && cronSecret.length >= 16 && timingSafeEq(bearer, cronSecret)) return null;
  if (!bearer) return apiError('unauthorized', 'Missing bearer token', requestId);

  const admin = await requireAdminRequest(req, requestId);
  return admin instanceof NextResponse ? admin : null;
}
