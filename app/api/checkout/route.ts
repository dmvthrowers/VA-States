import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { logAudit } from '@/lib/audit';
import { applyPaidSession } from '@/lib/payments';

export const runtime = 'nodejs';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/**
 * Return a Stripe Checkout URL for an existing registration. The client
 * redirects the browser to that URL.
 *
 * POST { id: <registration uuid> }  →  { url: <stripe checkout url> }
 *
 * A registration has at most one payable session at a time, so it can't be
 * paid twice (two tabs, a double click, or paying again because the confirm
 * page hadn't caught up with Stripe yet):
 *   - an open session is reused;
 *   - a completed session is recorded (same path as the webhook) and the
 *     request is refused as already paid;
 *   - only an expired session, or none, leads to a new one, created with an
 *     idempotency key so simultaneous clicks get the same session.
 *
 * Comp / $0 registrations and already-paid registrations are rejected — they
 * never need to hit Stripe.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  if (!hasStripeCredentials()) {
    return apiError('upstream_error', 'Online card payment is not configured yet.', requestId);
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const id = body.id?.trim();
  if (!id) return apiError('bad_request', 'Missing registration id', requestId);

  const supabase = createAdminClient();
  const { data: reg, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, email, divisions, fee_cents, paid, checkout_session_id')
    .eq('id', id)
    .single();

  if (error || !reg) return apiError('not_found', 'Registration not found', requestId);
  if (reg.paid) return apiError('conflict', 'This registration is already paid.', requestId);
  if (!reg.fee_cents || reg.fee_cents <= 0) {
    return apiError('unprocessable', 'No payment is due for this registration.', requestId);
  }

  const stripe = getStripe();

  if (reg.checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(reg.checkout_session_id).catch(() => null);
    if (existing?.status === 'open' && existing.url) {
      return NextResponse.json({ url: existing.url, reused: true }, { headers: { 'x-request-id': requestId } });
    }
    if (existing?.status === 'complete') {
      // Paid (or still processing) but not recorded yet: the webhook is late.
      const { decision } = await applyPaidSession(existing, 'checkout');
      const message = existing.payment_status === 'paid'
        ? 'This registration is already paid. Refresh the page to see it.'
        : 'Your last payment is still processing with Stripe. Please wait a few minutes before trying again.';
      await logAudit('checkout_blocked_existing_payment', {
        registrationId: reg.id,
        actor: 'system',
        details: { session_id: existing.id, payment_status: existing.payment_status, decision: decision.action },
      });
      return apiError('conflict', message, requestId);
    }
  }

  const displayName = `${reg.first_name} ${reg.last_name}`.trim();
  const divisions = Array.isArray(reg.divisions) ? reg.divisions.join(', ') : '';

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    customer_email: reg.email ?? undefined,
    client_reference_id: reg.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: reg.fee_cents,
          product_data: {
            name: 'VSYC-26 Competitor Registration',
            description: divisions ? `Divisions: ${divisions} · ${displayName}` : displayName,
          },
        },
      },
    ],
    metadata: { registration_id: reg.id },
    payment_intent_data: { metadata: { registration_id: reg.id } },
    success_url: `${BASE_URL}/confirm?id=${reg.id}&paid=1`,
    cancel_url: `${BASE_URL}/confirm?id=${reg.id}&canceled=1`,
  };
  // Same registration + same previous session → same new session, so two
  // simultaneous clicks can't create two payable sessions.
  const idempotencyKey = `checkout:${reg.id}:${reg.checkout_session_id ?? 'first'}`;
  const session = await stripe.checkout.sessions
    .create(params, { idempotencyKey })
    .catch((err: unknown) => {
      // The key was used with different details (e.g. the email changed):
      // fall back to a fresh key rather than failing the payment.
      if (err instanceof Stripe.errors.StripeIdempotencyError) {
        return stripe.checkout.sessions.create(params, { idempotencyKey: `${idempotencyKey}:${Date.now()}` });
      }
      throw err;
    });

  // Store the session id so the webhook, confirm page and reconcile sweep can
  // find it. checkout_created_at tells the sweep it's recent enough to check.
  await supabase
    .from('vsyc_registrations')
    .update({ checkout_session_id: session.id, checkout_created_at: new Date().toISOString() })
    .eq('id', reg.id);

  await logAudit('checkout_session_created', {
    registrationId: reg.id,
    actor: 'system',
    details: { session_id: session.id, fee_cents: reg.fee_cents },
  });

  return NextResponse.json({ url: session.url }, { headers: { 'x-request-id': requestId } });
});
