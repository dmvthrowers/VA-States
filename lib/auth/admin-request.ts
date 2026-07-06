import { NextRequest } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

export async function requireAdminRequest(req: NextRequest, requestId: string) {
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
