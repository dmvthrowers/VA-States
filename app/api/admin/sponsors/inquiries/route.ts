import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';

/** GET /api/admin/sponsors/inquiries: inquiries from the public form, newest first. Needs `sponsors.manage`. */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await createAdminClient()
    .from('vsyc_sponsor_inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return apiError('upstream_error', 'Could not load inquiries', requestId);
  return NextResponse.json({ inquiries: data ?? [] }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } });
});
