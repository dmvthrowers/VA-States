import { NextRequest } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Admin routes allow this many calls per IP per minute, across all of them. Admin auth is a Supabase login,
 * not a password, so this is about cost and abuse (each call asks Supabase Auth to check the token), not
 * guessing. A busy dashboard stays well under it; checkRateLimit fails open if the limiter is down.
 */
export const ADMIN_RATE_LIMIT = { max: 60, windowMinutes: 1 } as const;

export async function requireAdminRequest(req: NextRequest, requestId: string) {
  const allowed = await checkRateLimit(getClientIp(req.headers), 'admin', ADMIN_RATE_LIMIT.max, ADMIN_RATE_LIMIT.windowMinutes);
  if (!allowed) {
    return apiError('rate_limited', 'Too many requests. Wait a minute and try again.', requestId, { 'Retry-After': '60' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

/**
 * Run order (day-of scheduling, advancing, music) can be edited by admins,
 * DJ/audio staff, and judges, so any of them can reorder or skip competitors
 * live without waiting on an admin.
 */
export async function requireRunOrderEditorRequest(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !['admin', 'dj', 'audio_tech', 'judge'].includes(identity.role)) {
    return apiError('forbidden', 'Admin, DJ/audio, or judge staff access required', requestId);
  }

  return identity;
}

/**
 * Score review and release (the scores-in board, the head judge's "checked") belong to admins and judges.
 */
export async function requireScoreReviewRequest(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || !['admin', 'judge'].includes(identity.role)) {
    return apiError('forbidden', 'Admin or judge access required', requestId);
  }

  return identity;
}
