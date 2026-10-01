// Unit tests for the charge.refunded state transition (no Stripe or DB calls).
// Run: npm test  (Node's built-in test runner with TypeScript type stripping)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refundTransition, FULL_REFUND_UPDATE } from './stripe-refund.ts';

const charge = (over = {}) => ({
  payment_intent: 'pi_test_123',
  refunded: false,
  amount: 3500,
  amount_refunded: 0,
  currency: 'usd',
  ...over,
});

test('full refund flips the registration to unpaid', () => {
  const t = refundTransition(charge({ refunded: true, amount_refunded: 3500 }));
  assert.deepEqual(t, { kind: 'full', paymentIntentId: 'pi_test_123', amountRefunded: 3500, amount: 3500, currency: 'usd' });
  assert.deepEqual(FULL_REFUND_UPDATE, { paid: false, paid_at: null });
});

test('amount_refunded == amount counts as full even if refunded flag lags', () => {
  assert.equal(refundTransition(charge({ refunded: false, amount_refunded: 3500 })).kind, 'full');
});

test('partial refund keeps the registration paid', () => {
  const t = refundTransition(charge({ amount_refunded: 1000 }));
  assert.equal(t.kind, 'partial');
  assert.equal(t.amountRefunded, 1000);
});

test('expanded payment_intent object is accepted', () => {
  const t = refundTransition(charge({ payment_intent: { id: 'pi_obj_9' }, refunded: true, amount_refunded: 3500 }));
  assert.equal(t.kind, 'full');
  assert.equal(t.paymentIntentId, 'pi_obj_9');
});

test('charge without a payment intent is ignored', () => {
  assert.deepEqual(refundTransition(charge({ payment_intent: null, refunded: true, amount_refunded: 3500 })), {
    kind: 'ignore',
    reason: 'no_payment_intent',
  });
});

test('nothing refunded is ignored', () => {
  assert.deepEqual(refundTransition(charge()), { kind: 'ignore', reason: 'nothing_refunded' });
});

test('the same event twice yields the same transition (DB guard makes the 2nd a no-op)', () => {
  const c = charge({ refunded: true, amount_refunded: 3500 });
  assert.deepEqual(refundTransition(c), refundTransition(c));
});
