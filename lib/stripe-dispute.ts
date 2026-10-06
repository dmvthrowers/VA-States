import type Stripe from 'stripe';

/**
 * Decide what a `charge.dispute.*` webhook event means. Pure (no Stripe or DB calls) so the
 * decision is unit-testable, like lib/stripe-refund.ts.
 *
 * - `charge.dispute.created`: a customer's bank opened a dispute. The money is held back and
 *   the organizer has until `evidenceDueBy` to respond in the Stripe Dashboard.
 * - `charge.dispute.closed`: it ended. `won` returns the money; `lost` keeps it with the customer;
 *   `warning_closed` is an early-warning inquiry that closed without becoming a chargeback.
 * - anything else (updated, funds_withdrawn, funds_reinstated…) is ignored: `created` and
 *   `closed` are the two moments someone has to act.
 */
export type DisputeTransition =
  | {
      kind: 'opened';
      disputeId: string;
      paymentIntentId: string | null;
      amount: number;
      currency: string;
      reason: string;
      /** ISO time the evidence is due, or null when Stripe doesn't say */
      evidenceDueBy: string | null;
      status: string;
    }
  | {
      kind: 'closed';
      outcome: 'won' | 'lost' | 'warning_closed';
      disputeId: string;
      paymentIntentId: string | null;
      amount: number;
      currency: string;
      reason: string;
      status: string;
    }
  | { kind: 'ignore'; reason: 'event_type' | 'unexpected_status' };

type DisputeLike = Pick<Stripe.Dispute, 'id' | 'amount' | 'currency' | 'reason' | 'status' | 'payment_intent'> & {
  evidence_details?: { due_by?: number | null } | null;
};

const intentOf = (d: DisputeLike): string | null =>
  typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent?.id ?? null;

export function disputeTransition(eventType: string, d: DisputeLike): DisputeTransition {
  const base = { disputeId: d.id, paymentIntentId: intentOf(d), amount: d.amount, currency: d.currency, reason: d.reason, status: d.status };
  if (eventType === 'charge.dispute.created') {
    const due = d.evidence_details?.due_by;
    return { kind: 'opened', ...base, evidenceDueBy: typeof due === 'number' ? new Date(due * 1000).toISOString() : null };
  }
  if (eventType === 'charge.dispute.closed') {
    if (d.status === 'won' || d.status === 'lost' || d.status === 'warning_closed') {
      return { kind: 'closed', outcome: d.status, ...base };
    }
    return { kind: 'ignore', reason: 'unexpected_status' };
  }
  return { kind: 'ignore', reason: 'event_type' };
}

/** What the flag row looks like after a close: won and warning_closed are resolved; lost stays open for a decision. */
export function flagAfterClose(outcome: 'won' | 'lost' | 'warning_closed'): { status: 'open' | 'resolved'; note: string } {
  switch (outcome) {
    case 'won': return { status: 'resolved', note: 'Dispute won: the funds were returned.' };
    case 'warning_closed': return { status: 'resolved', note: 'Early-warning inquiry closed without a chargeback.' };
    case 'lost': return { status: 'open', note: 'Dispute lost: the funds went back to the customer. Decide whether the registration stays paid, then resolve this flag.' };
  }
}

/** "Fraudulent" ← "fraudulent", "product_not_received" ← "Product not received" */
export const disputeReasonLabel = (reason: string): string => {
  const s = reason.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
