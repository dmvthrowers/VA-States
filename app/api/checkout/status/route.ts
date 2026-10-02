import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { applyPaidSession } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/checkout/status?id=<registration uuid>
 *   → { paid: boolean, processing: boolean }
 *
 * Polled by the confirm page after Stripe redirects back. When the webhook
 * hasn't landed yet, this asks Stripe directly and records the payment through
 * the same applyPaidSession() the webhook uses, so the page shows "paid"
 * within seconds and nobody pays twice waiting for it.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  if (!(await checkRateLimit(ip, 'checkout-status', 60, 5))) {
    return apiError('rate_limited', 'Too many status checks. Please wait a moment.', requestId, { 'Retry-After': '60' });
  }

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return apiError('bad_request', 'Invalid registration id', requestId);

  const { data: reg } = await createAdminClient()
    .from('vsyc_registrations')
    .select('id, paid, checkout_session_id')
    .eq('id', id)
    .maybeSingle();
  if (!reg) return apiError('not_found', 'Registration not found', requestId);

  const respond = (paid: boolean, processing = false) =>
    NextResponse.json({ paid, processing }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } });

  if (reg.paid) return respond(true);
  if (!reg.checkout_session_id || !hasStripeCredentials()) return respond(false);

  const session = await getStripe().checkout.sessions.retrieve(reg.checkout_session_id).catch(() => null);
  if (!session || session.status !== 'complete') return respond(false);
  if (session.payment_status !== 'paid') return respond(false, true); // e.g. bank payment still clearing

  const { decision } = await applyPaidSession(session, 'confirm_page');
  return respond(decision.action === 'mark_paid' || decision.action === 'already_recorded' || decision.action === 'flag_duplicate');
});
