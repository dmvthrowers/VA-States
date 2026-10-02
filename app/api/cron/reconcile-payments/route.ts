import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api-error';
import { requireCronOrAdmin } from '@/lib/auth/cron';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { applyPaidSession } from '@/lib/payments';
import { logAudit } from '@/lib/audit';
import { heartbeat } from '@/lib/heartbeat';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Stripe sessions expire after 24h and webhooks retry for 3 days; look back that far. */
const LOOKBACK_SECONDS = 3 * 24 * 60 * 60;

/**
 * Safety net for late or missing webhooks: list every completed Checkout
 * Session from the last 3 days and record each through applyPaidSession(),
 * the same path the webhook uses. Already-recorded payments are no-ops; a
 * missed payment is marked paid (and its "payment received" email queued); a
 * second payment on a paid registration is flagged for the organizer.
 *
 * Called every 15 minutes by Supabase pg_cron while a checkout was started in
 * the last 3 days (migration 0036), daily by Vercel cron, or by an admin.
 */
async function handle(requestId: string, req: NextRequest) {
  const denied = await requireCronOrAdmin(req, requestId);
  if (denied) return denied;
  if (!hasStripeCredentials()) {
    await heartbeat('vsyc-reconcile-payments', 'fail');
    return NextResponse.json({ ok: false, reason: 'stripe_not_configured' }, { headers: { 'x-request-id': requestId } });
  }

  const counts: Record<string, number> = {};
  const since = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const sessions = getStripe().checkout.sessions.list({ created: { gte: since }, status: 'complete', limit: 100 });

  try {
    for await (const session of sessions) {
      if (!session.metadata?.registration_id && !session.client_reference_id) continue; // not a registration
      const { decision } = await applyPaidSession(session, 'reconcile');
      const key = decision.action === 'ignore' ? `ignore_${decision.reason}` : decision.action;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  } catch (e) {
    await heartbeat('vsyc-reconcile-payments', 'fail');
    throw e;
  }

  // The webhook normally records these first. One right after a checkout can
  // be a race; repeats mean webhooks are being missed and need checking.
  if (counts.mark_paid) {
    Sentry.captureMessage('Reconcile recorded payments before the Stripe webhook did', {
      level: 'warning',
      extra: { mark_paid: counts.mark_paid },
    });
  }

  // Only log runs that changed something, so the audit log isn't a heartbeat.
  if (counts.mark_paid || counts.flag_duplicate) {
    await logAudit('payments_reconciled', { actor: 'system', details: counts });
  }
  await heartbeat('vsyc-reconcile-payments');
  return NextResponse.json({ ok: true, ...counts }, { headers: { 'x-request-id': requestId } });
}

export const GET = withErrorHandling(handle);
export const POST = withErrorHandling(handle);
