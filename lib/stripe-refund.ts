import type Stripe from 'stripe';

/**
 * Decide what a `charge.refunded` webhook event means for a registration.
 * Pure (no Stripe/DB calls) so the state transition is unit-testable.
 *
 * Stripe sends `charge.refunded` for full AND partial refunds:
 *   - full    → `charge.refunded === true` (amount_refunded == amount).
 *               The registration flips back to unpaid.
 *   - partial → `charge.refunded === false`, 0 < amount_refunded < amount.
 *               The registration stays paid; the refund is audit-logged only.
 *   - ignore  → no payment intent to match on, or nothing refunded.
 */
export type RefundTransition =
  | { kind: 'full'; paymentIntentId: string; amountRefunded: number; amount: number; currency: string }
  | { kind: 'partial'; paymentIntentId: string; amountRefunded: number; amount: number; currency: string }
  | { kind: 'ignore'; reason: 'no_payment_intent' | 'nothing_refunded' };

type RefundedCharge = Pick<Stripe.Charge, 'payment_intent' | 'refunded' | 'amount' | 'amount_refunded' | 'currency'>;

export function refundTransition(charge: RefundedCharge): RefundTransition {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return { kind: 'ignore', reason: 'no_payment_intent' };
  if (!charge.refunded && charge.amount_refunded <= 0) return { kind: 'ignore', reason: 'nothing_refunded' };

  const base = {
    paymentIntentId,
    amountRefunded: charge.amount_refunded,
    amount: charge.amount,
    currency: charge.currency,
  };
  const full = charge.refunded || charge.amount_refunded >= charge.amount;
  return full ? { kind: 'full', ...base } : { kind: 'partial', ...base };
}

/**
 * Row update for a full refund. Matches admin "mark unpaid" (paid=false,
 * paid_at=null). payment_method / payment_intent_id / amount_paid_cents are
 * kept so the row still shows it was a Stripe payment and which charge was
 * refunded; the audit log records the refund itself.
 */
export const FULL_REFUND_UPDATE = { paid: false, paid_at: null } as const;
