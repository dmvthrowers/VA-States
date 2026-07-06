import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive) {
    return apiError('unauthorized', 'Staff access denied', requestId);
  }

  return NextResponse.json(
    {
      auth_user_id: identity.authUserId,
      email: identity.email,
      role: identity.role,
      display_name: identity.displayName,
      is_active: identity.isActive,
    },
    { headers: { 'x-request-id': requestId } }
  );
});
