import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getDb().prepare('SELECT id FROM vsyc_registrations LIMIT 1').first();
    return NextResponse.json({ ok: true, db: 'connected', ts: new Date().toISOString() });
  } catch (e) {
    console.error('[health] check failed:', e);
    return NextResponse.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}
