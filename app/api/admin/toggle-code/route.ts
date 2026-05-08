import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const body = await req.formData().catch(() => null);
  if (!body) return NextResponse.json({ message: 'Bad request' }, { status: 400 });

  const id = body.get('id')?.toString();
  const active = body.get('active')?.toString() === '1';
  if (!id) return NextResponse.json({ message: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_comp_codes')
    .update({ active })
    .eq('id', id);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  await logAudit('updated', { registrationId: id, actor: 'admin', details: { active } });

  return NextResponse.redirect(new URL('/admin/codes', req.url));
}
