import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

// Stripe needs the raw request body to verify the signature — never parse/cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. On a completed Checkout Session we mark the matching
 * registration paid. Idempotent: re-delivered events are safe to replay.
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   Endpoint: {BASE_URL}/api/webhooks/stripe
 *   Event:    checkout.session.completed  (also fine to add async_payment_succeeded)
 *   Copy the signing secret into STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!hasStripeCredentials() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === 'paid') {
      const registrationId =
        session.metadata?.registration_id ?? session.client_reference_id ?? null;

      const supabase = createAdminClient();

      // Prefer the explicit id; fall back to the stored session id.
      const match = registrationId
        ? supabase.from('vsyc_registrations').update({
            paid: true,
            paid_at: new Date().toISOString(),
            payment_method: 'stripe',
            payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            checkout_session_id: session.id,
            amount_paid_cents: session.amount_total ?? null,
            paid_currency: session.currency ?? 'usd',
          }).eq('id', registrationId).eq('paid', false).select('id')
        : supabase.from('vsyc_registrations').update({
            paid: true,
            paid_at: new Date().toISOString(),
            payment_method: 'stripe',
            payment_intent_id:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
            amount_paid_cents: session.amount_total ?? null,
            paid_currency: session.currency ?? 'usd',
          }).eq('checkout_session_id', session.id).eq('paid', false).select('id');

      const { data, error } = await match;

      if (error) {
        console.error('[stripe webhook] DB update failed:', error);
        // 500 → Stripe retries.
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
      }

      if (data && data.length > 0) {
        await logAudit('payment_succeeded', {
          registrationId: data[0].id,
          actor: 'stripe',
          details: {
            session_id: session.id,
            amount_total: session.amount_total,
            currency: session.currency,
            event_id: event.id,
          },
        });
      }
      // If no rows matched it was already paid (idempotent replay) — still 200.
    }
  }

  return NextResponse.json({ received: true });
}
