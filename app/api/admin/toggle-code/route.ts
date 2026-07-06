import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { requireAdminRequest } from '@/lib/auth/admin-request';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.formData().catch(() => null);
  if (!body) return apiError('bad_request', 'Bad request', requestId);

  const code = body.get('code')?.toString();
  const active = body.get('active')?.toString() === '1';
  if (!code) return apiError('bad_request', 'Missing code', requestId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_comp_codes')
    .update({ active })
    .eq('code', code);

  if (error) return apiError('upstream_error', error.message, requestId);

  await logAudit('updated', { registrationId: code, actor: 'admin', details: { active } });

  return NextResponse.redirect(new URL('/admin-dashboard', req.url));
});
