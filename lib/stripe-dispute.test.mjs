// Unit tests for charge.dispute.* decisions (no Stripe or DB calls). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disputeTransition, flagAfterClose, disputeReasonLabel } from './stripe-dispute.ts';

const dispute = (over = {}) => ({
  id: 'dp_1', amount: 3000, currency: 'usd', reason: 'fraudulent', status: 'needs_response',
  payment_intent: 'pi_1', evidence_details: { due_by: 1_800_000_000 }, ...over,
});

test('a new dispute is opened, with the evidence deadline as an ISO time', () => {
  const t = disputeTransition('charge.dispute.created', dispute());
  assert.equal(t.kind, 'opened');
  assert.equal(t.paymentIntentId, 'pi_1');
  assert.equal(t.evidenceDueBy, new Date(1_800_000_000 * 1000).toISOString());
});

test('a missing deadline or an expanded payment intent object still works', () => {
  const t = disputeTransition('charge.dispute.created', dispute({ evidence_details: null, payment_intent: { id: 'pi_2' } }));
  assert.equal(t.kind, 'opened');
  assert.equal(t.evidenceDueBy, null);
  assert.equal(t.paymentIntentId, 'pi_2');
});

test('a dispute with no payment intent is still reported (paymentIntentId null)', () => {
  assert.equal(disputeTransition('charge.dispute.created', dispute({ payment_intent: null })).paymentIntentId, null);
});

test('closed disputes map won, lost and warning_closed', () => {
  for (const s of ['won', 'lost', 'warning_closed']) {
    const t = disputeTransition('charge.dispute.closed', dispute({ status: s }));
    assert.equal(t.kind, 'closed');
    assert.equal(t.outcome, s);
  }
});

test('a closed event with a status that is not final is ignored', () => {
  assert.deepEqual(disputeTransition('charge.dispute.closed', dispute({ status: 'under_review' })), { kind: 'ignore', reason: 'unexpected_status' });
});

test('other dispute events are ignored', () => {
  for (const type of ['charge.dispute.updated', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated']) {
    assert.deepEqual(disputeTransition(type, dispute()), { kind: 'ignore', reason: 'event_type' });
  }
});

test('only a lost dispute leaves the flag open', () => {
  assert.equal(flagAfterClose('won').status, 'resolved');
  assert.equal(flagAfterClose('warning_closed').status, 'resolved');
  assert.equal(flagAfterClose('lost').status, 'open');
});

test('reason labels read well', () => {
  assert.equal(disputeReasonLabel('product_not_received'), 'Product not received');
  assert.equal(disputeReasonLabel('fraudulent'), 'Fraudulent');
});
