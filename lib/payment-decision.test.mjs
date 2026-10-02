// Unit tests for paid-session decisions (no Stripe or DB calls).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePaidSession } from './payment-decision.ts';

const session = (over = {}) => ({ sessionId: 'cs_A', paymentIntentId: 'pi_A', paymentStatus: 'paid', ...over });
const reg = (over = {}) => ({ paid: false, payment_intent_id: null, checkout_session_id: 'cs_A', ...over });

test('first sighting of a paid session marks the registration paid', () => {
  assert.deepEqual(decidePaidSession(session(), reg()), { action: 'mark_paid' });
});

test('a session still processing is ignored (no false "paid")', () => {
  assert.deepEqual(decidePaidSession(session({ paymentStatus: 'unpaid' }), reg()), { action: 'ignore', reason: 'not_paid' });
});

test('no matching registration is ignored', () => {
  assert.deepEqual(decidePaidSession(session(), null), { action: 'ignore', reason: 'no_registration' });
});

test('the same payment seen again is a no-op (webhook replay, confirm page, sweep)', () => {
  const r = reg({ paid: true, payment_intent_id: 'pi_A' });
  assert.deepEqual(decidePaidSession(session(), r), { action: 'already_recorded' });
});

test('a second, different payment on a paid registration is flagged, not recorded', () => {
  const r = reg({ paid: true, payment_intent_id: 'pi_A', checkout_session_id: 'cs_A' });
  assert.deepEqual(decidePaidSession(session({ sessionId: 'cs_B', paymentIntentId: 'pi_B' }), r), { action: 'flag_duplicate' });
});

test('a Stripe payment on a registration already marked paid by hand is flagged', () => {
  const r = reg({ paid: true, payment_intent_id: null, checkout_session_id: null });
  assert.deepEqual(decidePaidSession(session(), r), { action: 'flag_duplicate' });
});

test('a refunded payment seen again does not re-mark the registration paid', () => {
  const r = reg({ paid: false, payment_intent_id: 'pi_A' });
  assert.deepEqual(decidePaidSession(session(), r), { action: 'ignore', reason: 'refunded' });
});

test('a new payment after a refund is recorded', () => {
  const r = reg({ paid: false, payment_intent_id: 'pi_A' });
  assert.deepEqual(decidePaidSession(session({ sessionId: 'cs_B', paymentIntentId: 'pi_B' }), r), { action: 'mark_paid' });
});

test('without a payment intent, the session id identifies the payment', () => {
  const r = reg({ paid: true, payment_intent_id: null, checkout_session_id: 'cs_A' });
  assert.deepEqual(decidePaidSession(session({ paymentIntentId: null }), r), { action: 'already_recorded' });
});
