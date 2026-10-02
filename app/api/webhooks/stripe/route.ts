import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { refundTransition, FULL_REFUND_UPDATE } from '@/lib/stripe-refund';
import { applyPaidSession } from '@/lib/payments';

// Stripe needs the raw request body to verify the signature — never parse/cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook. On a completed Checkout Session we mark the matching
 * registration paid (or flag a duplicate payment); on a full charge.refunded
 * we mark it unpaid again. Every event is recorded in vsyc_stripe_events.
 * Idempotent: re-delivered events are safe to replay. If the webhook is late
 * or never arrives, the confirm page and the reconcile sweep record the
 * payment through the same applyPaidSession().
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 *   Endpoint: {BASE_URL}/api/webhooks/stripe
 *   Events:   checkout.session.completed  (also fine to add async_payment_succeeded)
 *             charge.refunded
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

  // Inbox: record every event before handling it, so "did Stripe ever tell
  // us?" has an answer. A redelivery of an event we already processed is
  // acknowledged without doing anything.
  const inbox = createAdminClient().from('vsyc_stripe_events');
  const { data: fresh } = await inbox
    .upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (!fresh?.length) {
    const { data: seen } = await inbox.select('processed_at, attempts').eq('id', event.id).maybeSingle();
    if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });
    await inbox.update({ attempts: (seen?.attempts ?? 1) + 1 }).eq('id', event.id);
  }

  try {
    const response = await handleEvent(event);
    await inbox.update({ processed_at: new Date().toISOString(), last_error: null }).eq('id', event.id);
    return response;
  } catch (err) {
    console.error('[stripe webhook] handling failed:', err);
    await inbox.update({ last_error: String(err) }).eq('id', event.id);
    // 500 → Stripe retries (for up to 3 days); the reconcile sweep also catches it.
    return NextResponse.json({ error: 'Handling failed' }, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<NextResponse> {
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    // Marks the registration paid, or flags a second payment on an already-paid
    // registration for the organizer. Idempotent across replays and the other
    // paths (confirm page, reconcile sweep) that call the same function.
    await applyPaidSession(event.data.object as Stripe.Checkout.Session, 'webhook');
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const t = refundTransition(charge);

    if (t.kind === 'full') {
      const supabase = createAdminClient();
      // Refunding a flagged duplicate in Stripe closes its flag. The
      // registration itself keeps its original payment, so the update below
      // (which matches that payment's intent) leaves it alone.
      await supabase
        .from('vsyc_payment_flags')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), note: 'Refunded in Stripe' })
        .eq('payment_intent_id', t.paymentIntentId)
        .eq('status', 'open');
      // eq('paid', true) makes replays a no-op, same pattern as the paid handler.
      const { data, error } = await supabase
        .from('vsyc_registrations')
        .update(FULL_REFUND_UPDATE)
        .eq('payment_intent_id', t.paymentIntentId)
        .eq('paid', true)
        .select('id');

      if (error) {
        console.error('[stripe webhook] refund DB update failed:', error);
        throw new Error(`refund DB update failed: ${error.message}`);
      }

      if (data && data.length > 0) {
        await logAudit('payment_refunded', {
          registrationId: data[0].id,
          actor: 'stripe',
          details: {
            charge_id: charge.id,
            payment_intent_id: t.paymentIntentId,
            amount_refunded: t.amountRefunded,
            currency: t.currency,
            event_id: event.id,
          },
        });
      }
      // No rows: already unpaid (replay) or not a registration payment — still 200.
    } else if (t.kind === 'partial') {
      // Partial refunds leave the registration paid; record them for the treasurer.
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('vsyc_registrations')
        .select('id')
        .eq('payment_intent_id', t.paymentIntentId)
        .limit(1);
      await logAudit('payment_partially_refunded', {
        registrationId: data?.[0]?.id,
        actor: 'stripe',
        details: {
          charge_id: charge.id,
          payment_intent_id: t.paymentIntentId,
          amount_refunded: t.amountRefunded,
          amount: t.amount,
          currency: t.currency,
          event_id: event.id,
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}
