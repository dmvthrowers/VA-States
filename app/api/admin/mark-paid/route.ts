import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db';

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

  // Only touch payment_method / admin_notes when explicitly provided, so a
  // bare paid/unpaid toggle never wipes existing notes or method.
  const sets = ['paid = ?', 'paid_at = ?'];
  const params: unknown[] = [paid ? 1 : 0, paid ? new Date().toISOString() : null];
  if (payment_method !== undefined) { sets.push('payment_method = ?'); params.push(payment_method); }
  if (notes !== undefined) { sets.push('admin_notes = ?'); params.push(notes); }
  params.push(id);

  try {
    await getDb()
      .prepare(`UPDATE vsyc_registrations SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();
  } catch (e) {
    console.error('[mark-paid] update error:', e);
    return NextResponse.json({ message: 'Update failed' }, { status: 500 });
  }

  await logAudit(paid ? 'marked_paid' : 'marked_unpaid', {
    registrationId: id,
    actor: 'admin',
    details: { payment_method, notes },
  });

  if (isForm) return NextResponse.redirect(new URL('/admin', req.url));
  return NextResponse.json({ ok: true });
}
