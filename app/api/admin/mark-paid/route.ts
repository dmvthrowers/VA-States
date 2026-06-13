import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';

// Accepts both FormData (from admin table toggle) and JSON (from API clients)
export async function POST(req: NextRequest) {
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

  if (!id) return NextResponse.json({ message: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  // Only touch payment_method / admin_notes when explicitly provided, so a
  // bare paid/unpaid toggle never wipes existing notes or method.
  const update: Record<string, unknown> = {
    paid,
    paid_at: paid ? new Date().toISOString() : null,
  };
  if (payment_method !== undefined) update.payment_method = payment_method;
  if (notes !== undefined) update.admin_notes = notes;

  const { error } = await supabase
    .from('vsyc_registrations')
    .update(update)
    .eq('id', id);

  if (error) return NextResponse.json({ message: 'Update failed' }, { status: 500 });

  await logAudit(paid ? 'marked_paid' : 'marked_unpaid', {
    registrationId: id,
    actor: 'admin',
    details: { payment_method, notes },
  });

  if (isForm) return NextResponse.redirect(new URL('/admin', req.url));
  return NextResponse.json({ ok: true });
}
