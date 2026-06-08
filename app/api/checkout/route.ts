import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, hasStripeCredentials } from '@/lib/stripe';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/**
 * Create a Stripe Checkout Session for an existing registration and return its
 * hosted-payment URL. The client redirects the browser to that URL.
 *
 * POST { id: <registration uuid> }  →  { url: <stripe checkout url> }
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
    .select('id, first_name, last_name, email, divisions, fee_cents, paid')
    .eq('id', id)
    .single();

  if (error || !reg) return apiError('not_found', 'Registration not found', requestId);
  if (reg.paid) return apiError('conflict', 'This registration is already paid.', requestId);
  if (!reg.fee_cents || reg.fee_cents <= 0) {
    return apiError('unprocessable', 'No payment is due for this registration.', requestId);
  }

  const stripe = getStripe();
  const displayName = `${reg.first_name} ${reg.last_name}`.trim();
  const divisions = Array.isArray(reg.divisions) ? reg.divisions.join(', ') : '';

  const session = await stripe.checkout.sessions.create({
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
  });

  // Store the session id so the webhook (and admin) can reconcile.
  await supabase
    .from('vsyc_registrations')
    .update({ checkout_session_id: session.id })
    .eq('id', reg.id);

  await logAudit('checkout_session_created', {
    registrationId: reg.id,
    actor: 'system',
    details: { session_id: session.id, fee_cents: reg.fee_cents },
  });

  return NextResponse.json({ url: session.url }, { headers: { 'x-request-id': requestId } });
});
