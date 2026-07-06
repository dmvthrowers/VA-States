import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function isAuthorizedHealthProbe(req: NextRequest): boolean {
  const token = process.env.HEALTHCHECK_TOKEN;
  if (!token) return false;

  const headerToken = req.headers.get('x-healthcheck-token');
  const queryToken = req.nextUrl.searchParams.get('token');
  return headerToken === token || queryToken === token;
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1';

  // Keep default health checks lightweight to avoid burning Supabase query
  // quotas from scanners/crawlers. Deep checks require explicit auth token.
  if (!deep || !isAuthorizedHealthProbe(req)) {
    return NextResponse.json(
      { ok: true, db: 'skipped', ts: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('vsyc_registrations').select('id').limit(1);
    if (error) throw error;
    return NextResponse.json(
      { ok: true, db: 'connected', ts: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
