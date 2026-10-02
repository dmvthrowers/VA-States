/**
 * What a completed Stripe Checkout Session means for a registration. Pure (no
 * Stripe or DB calls) so the rules are unit-testable; lib/payments.ts applies
 * them. The webhook, the confirm page's status check, and the reconcile sweep
 * all go through this, so whichever sees a payment first records it and the
 * others are no-ops.
 */

export interface SessionFacts {
  sessionId: string;
  paymentIntentId: string | null;
  /** Stripe's session.payment_status: 'paid' | 'unpaid' | 'no_payment_required' */
  paymentStatus: string;
}

export interface RegistrationPaymentState {
  paid: boolean;
  payment_intent_id: string | null;
  checkout_session_id: string | null;
}

export type PaidDecision =
  /** Not a finished payment (still processing, or no matching registration). */
  | { action: 'ignore'; reason: 'not_paid' | 'no_registration' | 'refunded' }
  /** First time we see this payment: mark the registration paid. */
  | { action: 'mark_paid' }
  /** This exact payment is already recorded (webhook replay, a second path). */
  | { action: 'already_recorded' }
  /** The registration was already paid by a different payment: flag for a refund decision. */
  | { action: 'flag_duplicate' };

export function decidePaidSession(session: SessionFacts, reg: RegistrationPaymentState | null): PaidDecision {
  if (session.paymentStatus !== 'paid') return { action: 'ignore', reason: 'not_paid' };
  if (!reg) return { action: 'ignore', reason: 'no_registration' };

  const samePayment = session.paymentIntentId
    ? reg.payment_intent_id === session.paymentIntentId
    : reg.checkout_session_id === session.sessionId && reg.payment_intent_id === null;

  if (!reg.paid) {
    // A full refund flips paid back to false but keeps payment_intent_id. Seeing
    // that same payment again (a late replay, the reconcile sweep) must not
    // mark it paid a second time.
    if (session.paymentIntentId && samePayment) return { action: 'ignore', reason: 'refunded' };
    return { action: 'mark_paid' };
  }
  return samePayment ? { action: 'already_recorded' } : { action: 'flag_duplicate' };
}
