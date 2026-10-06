/**
 * charge.dispute.created / charge.dispute.closed (server only). Opens or closes a row in
 * vsyc_payment_flags, writes the audit log and emails the organizer. The registration is never
 * changed automatically: a dispute is a decision for a person (respond with evidence, refund, or
 * accept it), and a competitor shouldn't lose their spot because of an open inquiry. The decisions
 * live in lib/stripe-dispute.ts.
 */
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { sendAdminAlertEmail } from '@/lib/email';
import { disputeReasonLabel, disputeTransition, flagAfterClose } from '@/lib/stripe-dispute';

const money = (cents: number, currency: string) =>
  `${currency.toLowerCase() === 'usd' ? '$' : `${currency.toUpperCase()} `}${(cents / 100).toFixed(2)}`;

const dashboardUrl = (disputeId: string) => `https://dashboard.stripe.com/disputes/${disputeId}`;

/** Handle one dispute event. Idempotent: a replay changes nothing and sends no second alert. */
export async function handleDisputeEvent(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const t = disputeTransition(event.type, dispute);
  if (t.kind === 'ignore') return;

  const db = createAdminClient();
  let registrationId: string | null = null;
  let who = 'an unknown registration (no matching payment in the database)';
  if (t.paymentIntentId) {
    const { data, error } = await db
      .from('vsyc_registrations')
      .select('id, first_name, last_name, email')
      .eq('payment_intent_id', t.paymentIntentId)
      .limit(1);
    if (error) throw new Error(`dispute registration lookup failed: ${error.message}`);
    const reg = data?.[0];
    if (reg) {
      registrationId = reg.id;
      who = `${reg.first_name} ${reg.last_name} (${reg.email})`;
    }
  }
  const amount = money(t.amount, t.currency);
  const reason = disputeReasonLabel(t.reason);

  if (t.kind === 'opened') {
    const { data, error } = await db
      .from('vsyc_payment_flags')
      .upsert(
        {
          kind: 'dispute',
          registration_id: registrationId,
          dispute_id: t.disputeId,
          dispute_status: t.status,
          dispute_reason: t.reason,
          evidence_due_by: t.evidenceDueBy,
          disputed_payment_intent: t.paymentIntentId,
          amount_cents: t.amount,
          currency: t.currency,
          detected_by: 'webhook',
          status: 'open',
          note: 'Dispute opened. Respond with evidence in the Stripe Dashboard before the deadline.',
        },
        { onConflict: 'dispute_id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`dispute flag failed: ${error.message}`);
    if (!data?.length) return; // already flagged: a replay

    await logAudit('payment_disputed', {
      registrationId: registrationId ?? undefined,
      actor: 'stripe',
      details: { dispute_id: t.disputeId, payment_intent_id: t.paymentIntentId, amount: t.amount, currency: t.currency, reason: t.reason, evidence_due_by: t.evidenceDueBy, event_id: event.id },
    });
    await sendAdminAlertEmail(
      {
        subject: `Chargeback: ${amount} disputed (${reason})`,
        lines: [
          `A dispute was opened on a payment from ${who}: ${amount}, reason "${reason}".`,
          t.evidenceDueBy
            ? `Evidence is due ${new Date(t.evidenceDueBy).toUTCString()}. Missing the deadline loses the dispute.`
            : `Stripe didn't give an evidence deadline. Check the dispute now.`,
          `Respond or accept it in the Stripe Dashboard: ${dashboardUrl(t.disputeId)}`,
          `The registration is still marked paid. Nothing was changed automatically. The flag is in vsyc_payment_flags (kind "dispute") until you resolve it.`,
        ],
      },
      { dedupeKey: `dispute_opened:${t.disputeId}` },
    );
    return;
  }

  // closed
  const after = flagAfterClose(t.outcome);
  const { data: updated, error: updateError } = await db
    .from('vsyc_payment_flags')
    .update({
      status: after.status,
      resolved_at: after.status === 'resolved' ? new Date().toISOString() : null,
      dispute_status: t.status,
      note: after.note,
    })
    .eq('dispute_id', t.disputeId)
    .select('id');
  if (updateError) throw new Error(`dispute flag update failed: ${updateError.message}`);
  if (!updated?.length) {
    // We never saw it open (the webhook was added late, or the created event was lost): record it now.
    const { error } = await db.from('vsyc_payment_flags').upsert(
      {
        kind: 'dispute',
        registration_id: registrationId,
        dispute_id: t.disputeId,
        dispute_status: t.status,
        dispute_reason: t.reason,
        disputed_payment_intent: t.paymentIntentId,
        amount_cents: t.amount,
        currency: t.currency,
        detected_by: 'webhook',
        status: after.status,
        resolved_at: after.status === 'resolved' ? new Date().toISOString() : null,
        note: after.note,
      },
      { onConflict: 'dispute_id' },
    );
    if (error) throw new Error(`dispute flag insert failed: ${error.message}`);
  }

  await logAudit('payment_dispute_closed', {
    registrationId: registrationId ?? undefined,
    actor: 'stripe',
    details: { dispute_id: t.disputeId, outcome: t.outcome, payment_intent_id: t.paymentIntentId, amount: t.amount, currency: t.currency, event_id: event.id },
  });
  if (t.outcome === 'warning_closed') return; // nothing to tell anyone
  await sendAdminAlertEmail(
    {
      subject: t.outcome === 'lost' ? `Chargeback lost: ${amount} went back to the customer` : `Chargeback won: ${amount} returned`,
      lines: [
        `The dispute on ${who} (${amount}, "${reason}") closed as ${t.outcome}.`,
        t.outcome === 'lost'
          ? `The registration is still marked paid. Decide whether it stays that way (mark it unpaid in the admin dashboard if not), then resolve the flag in vsyc_payment_flags.`
          : `No action needed. The flag was resolved.`,
        dashboardUrl(t.disputeId),
      ],
    },
    { dedupeKey: `dispute_closed:${t.disputeId}` },
  );
}
