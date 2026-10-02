import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-error';
import { requireCronOrAdmin } from '@/lib/auth/cron';
import { drainOutbox } from '@/lib/outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sends are paced at 2/second; the drain stops starting new ones after 40s.
export const maxDuration = 60;

/**
 * Send due email_outbox rows. Called every 5 minutes by Supabase pg_cron
 * while a row is due (migration 0035), once a day by Vercel cron just after
 * the 00:00 UTC quota reset, or by an admin.
 */
async function handle(requestId: string, req: NextRequest) {
  const denied = await requireCronOrAdmin(req, requestId);
  if (denied) return denied;

  const summary = await drainOutbox(60);
  return NextResponse.json({ ok: true, ...summary }, { headers: { 'x-request-id': requestId } });
}

export const GET = withErrorHandling(handle);
export const POST = withErrorHandling(handle);
