import type Stripe from 'stripe';
import { createAdminClient } from './supabase/admin';
import { logAudit } from './audit';
import { sendAdminAlertEmail, sendPaymentReceivedEmail } from './email';
import { decidePaidSession, type PaidDecision, type RegistrationPaymentState } from './payment-decision';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://register.dmvthrowers.club';

export type PaymentSource = 'webhook' | 'confirm_page' | 'checkout' | 'reconcile';

type RegRow = RegistrationPaymentState & {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  parent_email: string | null;
  age_on_event: number;
};

const REG_COLUMNS = 'id, paid, payment_intent_id, checkout_session_id, email, first_name, last_name, parent_email, age_on_event';

function paymentIntentOf(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  return typeof pi === 'string' ? pi : pi?.id ?? null;
}

async function loadRegistration(session: Stripe.Checkout.Session): Promise<RegRow | null> {
  const supabase = createAdminClient();
  const id = session.metadata?.registration_id ?? session.client_reference_id ?? null;
  if (id) {
    const { data } = await supabase.from('vsyc_registrations').select(REG_COLUMNS).eq('id', id).maybeSingle();
    if (data) return data as RegRow;
  }
  const { data } = await supabase
    .from('vsyc_registrations')
    .select(REG_COLUMNS)
    .eq('checkout_session_id', session.id)
    .maybeSingle();
  return (data as RegRow | null) ?? null;
}

export interface ApplyResult {
  decision: PaidDecision;
  registrationId: string | null;
}

/**
 * Record a Stripe Checkout Session against its registration. Safe to call any
 * number of times from any path (webhook, confirm page, checkout, reconcile
 * sweep): the first caller to see a payment marks it paid and queues the
 * "payment received" email; a different payment on an already-paid
 * registration is flagged for the organizer, never recorded or refunded.
 */
export async function applyPaidSession(session: Stripe.Checkout.Session, source: PaymentSource): Promise<ApplyResult> {
  const facts = {
    sessionId: session.id,
    paymentIntentId: paymentIntentOf(session),
    paymentStatus: session.payment_status,
  };

  // Two attempts: if another path marks the row paid between our read and our
  // guarded update, re-read and decide again (it's then a replay or a duplicate).
  for (let attempt = 0; attempt < 2; attempt++) {
    const reg = await loadRegistration(session);
    const decision = decidePaidSession(facts, reg);
    const registrationId = reg?.id ?? null;

    if (decision.action === 'mark_paid' && reg) {
      const { data, error } = await createAdminClient()
        .from('vsyc_registrations')
        .update({
          paid: true,
          paid_at: new Date().toISOString(),
          payment_method: 'stripe',
          payment_intent_id: facts.paymentIntentId,
          checkout_session_id: session.id,
          amount_paid_cents: session.amount_total ?? null,
          paid_currency: session.currency ?? 'usd',
        })
        .eq('id', reg.id)
        .eq('paid', false)
        .select('id');
      if (error) throw new Error(`mark paid failed: ${error.message}`);
      if (!data?.length) continue; // lost the race; re-read

      await logAudit('payment_succeeded', {
        registrationId: reg.id,
        actor: 'stripe',
        details: {
          source,
          session_id: session.id,
          payment_intent_id: facts.paymentIntentId,
          amount_total: session.amount_total,
          currency: session.currency,
        },
      });
      await queuePaymentReceived(reg, session);
      return { decision, registrationId };
    }

    if (decision.action === 'flag_duplicate' && reg) {
      await flagDuplicate(reg, session, source);
    }
    return { decision, registrationId };
  }
  return { decision: { action: 'already_recorded' }, registrationId: null };
}

async function queuePaymentReceived(reg: RegRow, session: Stripe.Checkout.Session): Promise<void> {
  const params = {
    firstName: reg.first_name,
    amountCents: session.amount_total ?? 0,
    registrationId: reg.id,
    confirmUrl: `${BASE_URL}/confirm?id=${reg.id}`,
  };
  const recipients = [reg.email];
  if (reg.age_on_event < 18 && reg.parent_email && reg.parent_email.toLowerCase() !== reg.email.toLowerCase()) {
    recipients.push(reg.parent_email);
  }
  for (const to of recipients) {
    await sendPaymentReceivedEmail({ ...params, to }, { dedupeKey: `payment_received:${session.id}:${to.toLowerCase()}` });
  }
}

async function flagDuplicate(reg: RegRow, session: Stripe.Checkout.Session, source: PaymentSource): Promise<void> {
  const paymentIntentId = paymentIntentOf(session);
  const { data } = await createAdminClient()
    .from('vsyc_payment_flags')
    .upsert(
      {
        kind: 'duplicate_payment',
        registration_id: reg.id,
        payment_intent_id: paymentIntentId ?? session.id,
        checkout_session_id: session.id,
        amount_cents: session.amount_total ?? null,
        currency: session.currency ?? 'usd',
        detected_by: source,
      },
      { onConflict: 'payment_intent_id', ignoreDuplicates: true },
    )
    .select('id');
  if (!data?.length) return; // already flagged by another path

  const amount = `$${((session.amount_total ?? 0) / 100).toFixed(2)}`;
  await logAudit('duplicate_payment_flagged', {
    registrationId: reg.id,
    actor: 'stripe',
    details: { source, session_id: session.id, payment_intent_id: paymentIntentId, amount_total: session.amount_total },
  });
  await sendAdminAlertEmail(
    {
      subject: `Duplicate payment: ${reg.first_name} ${reg.last_name} paid ${amount} again`,
      lines: [
        `Registration ${reg.id} (${reg.email}) was already paid when another Stripe payment of ${amount} came in.`,
        `Stripe payment intent: ${paymentIntentId ?? 'n/a'} · checkout session: ${session.id}.`,
        `Nothing was refunded automatically. Review it in the Stripe Dashboard and refund the extra payment if it's a mistake, then mark the flag resolved in vsyc_payment_flags.`,
      ],
    },
    { dedupeKey: `duplicate_payment:${paymentIntentId ?? session.id}` },
  );
}
