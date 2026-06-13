import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const body = await req.formData().catch(() => null);
  if (!body) return NextResponse.json({ message: 'Bad request' }, { status: 400 });

  // Comp codes are keyed by the code itself (no surrogate id column)
  const code = body.get('code')?.toString();
  const active = body.get('active')?.toString() === '1';
  if (!code) return NextResponse.json({ message: 'Missing code' }, { status: 400 });

  try {
    await getDb()
      .prepare('UPDATE vsyc_comp_codes SET active = ?1 WHERE code = ?2')
      .bind(active ? 1 : 0, code)
      .run();
  } catch (e) {
    console.error('[toggle-code] update error:', e);
    return NextResponse.json({ message: 'Update failed' }, { status: 500 });
  }

  await logAudit('comp_code_toggled', { actor: 'admin', details: { code, active } });

  return NextResponse.redirect(new URL('/admin/codes', req.url));
}
