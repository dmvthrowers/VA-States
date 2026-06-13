import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('vsyc_registrations').select('id').limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, db: 'connected', ts: new Date().toISOString() });
  } catch (e) {
    console.error('[health] check failed:', e);
    return NextResponse.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}
