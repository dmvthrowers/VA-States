import { NextRequest, NextResponse } from 'next/server';
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
