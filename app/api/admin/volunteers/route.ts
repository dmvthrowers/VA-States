import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

/**
 * GET /api/admin/volunteers
 *
 * Full applicant list for the admin Volunteers tab, including PII (name,
 * email, phone, emergency contact). Admin-only.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();

  const [volunteersRes, rolesRes] = await Promise.all([
    supabase
      .from('vsyc_volunteers')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('vsyc_volunteer_roles')
      .select('*')
      .order('sort_order', { ascending: true }),
  ]);

  if (volunteersRes.error) {
    return apiError('upstream_error', 'Failed to load volunteers', requestId);
  }
  if (rolesRes.error) {
    return apiError('upstream_error', 'Failed to load volunteer roles', requestId);
  }

  return NextResponse.json(
    { volunteers: volunteersRes.data ?? [], roles: rolesRes.data ?? [] },
    { headers: { 'x-request-id': requestId } },
  );
});
