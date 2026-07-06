import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';

// Accepts both FormData (from admin table toggle) and JSON (from API clients)
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const contentType = req.headers.get('content-type') ?? '';
  let id: string, paid: boolean, payment_method: string | undefined, notes: string | undefined;
  const isForm = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');

  if (isForm) {
    const form = await req.formData();
    id = form.get('id')?.toString() ?? '';
    paid = form.get('paid')?.toString() === '1';
    payment_method = form.get('payment_method')?.toString();
    notes = form.get('notes')?.toString();
  } else {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    id = (body.id as string) ?? '';
    paid = Boolean(body.paid);
    payment_method = body.payment_method as string | undefined;
    notes = body.notes as string | undefined;
  }

  if (!id) return apiError('bad_request', 'id required', requestId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_registrations')
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
      payment_method: payment_method ?? 'pending',
      admin_notes: notes ?? null,
    })
    .eq('id', id);

  if (error) return apiError('upstream_error', 'Update failed', requestId);

  await logAudit(paid ? 'marked_paid' : 'marked_unpaid', {
    registrationId: id,
    actor: 'admin',
    details: { payment_method, notes },
  });

  if (isForm) return NextResponse.redirect(new URL('/admin-dashboard', req.url));
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
