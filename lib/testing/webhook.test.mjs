// Route-level tests for POST /api/webhooks/stripe (build plan 4.19): signature checks, event dispatch,
// duplicate delivery, refunds and failures. Runs the real route with its Stripe, database and audit
// dependencies stubbed. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadRoute, stubs } from './route-harness.mjs';

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
const { POST } = await loadRoute('app/api/webhooks/stripe/route.ts');

/** A fake supabase client: records updates, answers the events inbox like the real table would. */
function fakeDb({ seen = null, refundRows = [{ id: 'reg-1' }] } = {}) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const q = { table, op: null, patch: null, filters: [] };
      const chain = {
        upsert(row, opts) { q.op = 'upsert'; q.patch = row; q.opts = opts; return chain; },
        update(patch) { q.op = 'update'; q.patch = patch; return chain; },
        select() { q.selecting = true; return chain; },
        eq(c, v) { q.filters.push([c, v]); return chain; },
        limit() { return chain; },
        maybeSingle() { calls.push({ ...q }); return Promise.resolve({ data: table === 'vsyc_stripe_events' ? seen : null, error: null }); },
        then(res, rej) {
          calls.push({ ...q });
          let data = null;
          if (q.op === 'upsert' && table === 'vsyc_stripe_events') data = seen ? [] : [{ id: q.patch.id }];
          if (q.op === 'update' && table === 'vsyc_registrations' && q.selecting) data = refundRows;
          if (q.selecting && q.op === null && table === 'vsyc_registrations') data = [{ id: 'reg-1' }];
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return db;
}

let applied, disputes, audits, db;

function setup({ construct, seen, refundRows } = {}) {
  applied = []; disputes = []; audits = [];
  db = fakeDb({ seen, refundRows });
  stubs.set('stripe', {
    hasStripeCredentials: () => true,
    getStripe: () => ({ webhooks: { constructEvent: construct ?? ((body) => JSON.parse(body)) } }),
  });
  stubs.set('supabase-admin', { createAdminClient: () => db, hasAdminCredentials: () => true });
  stubs.set('payments', { applyPaidSession: async (s, via) => { applied.push([s.id, via]); } });
  stubs.set('stripe-dispute-server', { handleDisputeEvent: async (e) => { disputes.push(e.type); } });
  stubs.set('audit', { logAudit: async (action, opts) => { audits.push([action, opts]); } });
}

const request = (body, headers = { 'stripe-signature': 't=1,v1=abc' }) =>
  new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

const event = (type, object, id = 'evt_1') => ({ id, type, data: { object } });

beforeEach(() => { stubs.reset(); setup(); });

test('503 when Stripe is not configured', async () => {
  stubs.set('stripe', { hasStripeCredentials: () => false, getStripe: () => ({}) });
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.equal(res.status, 503);
});

test('400 when the signature header is missing', async () => {
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' }), {}));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /signature/i);
  assert.deepEqual(applied, []);
});

test('400 and nothing handled when the signature does not verify', async () => {
  setup({ construct: () => { throw new Error('bad sig'); } });
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.equal(res.status, 400);
  assert.deepEqual(applied, []);
  assert.equal(db.calls.length, 0, 'nothing is written for an unverified event');
});

test('checkout.session.completed marks the registration paid through applyPaidSession', async () => {
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.equal(res.status, 200);
  assert.deepEqual(applied, [['cs_1', 'webhook']]);
  const done = db.calls.find((c) => c.table === 'vsyc_stripe_events' && c.op === 'update' && c.patch.processed_at);
  assert.ok(done, 'the inbox row is marked processed');
});

test('async_payment_succeeded takes the same path', async () => {
  await POST(request(event('checkout.session.async_payment_succeeded', { id: 'cs_2' }, 'evt_2')));
  assert.deepEqual(applied, [['cs_2', 'webhook']]);
});

test('a redelivered event that was already processed is acknowledged and not handled again', async () => {
  setup({ seen: { processed_at: '2026-10-01T00:00:00Z', attempts: 1 } });
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, duplicate: true });
  assert.deepEqual(applied, []);
});

test('an event that was recorded but never finished is handled again', async () => {
  setup({ seen: { processed_at: null, attempts: 1 } });
  await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.deepEqual(applied, [['cs_1', 'webhook']]);
  assert.ok(db.calls.some((c) => c.op === 'update' && c.patch.attempts === 2), 'attempt counter goes up');
});

test('dispute events are handed to the dispute handler, never to the payment path', async () => {
  await POST(request(event('charge.dispute.created', { id: 'dp_1' }, 'evt_d1')));
  await POST(request(event('charge.dispute.closed', { id: 'dp_1' }, 'evt_d2')));
  assert.deepEqual(disputes, ['charge.dispute.created', 'charge.dispute.closed']);
  assert.deepEqual(applied, []);
});

test('a full refund marks the registration unpaid and writes an audit entry', async () => {
  const charge = { id: 'ch_1', payment_intent: 'pi_1', amount: 3000, amount_refunded: 3000, currency: 'usd', refunded: true };
  const res = await POST(request(event('charge.refunded', charge, 'evt_r1')));
  assert.equal(res.status, 200);
  const unpay = db.calls.find((c) => c.table === 'vsyc_registrations' && c.op === 'update');
  assert.equal(unpay.patch.paid, false);
  assert.deepEqual(unpay.filters, [['payment_intent_id', 'pi_1'], ['paid', true]]);
  assert.equal(audits[0][0], 'payment_refunded');
});

test('a partial refund leaves the registration paid and is audit-logged', async () => {
  const charge = { id: 'ch_2', payment_intent: 'pi_2', amount: 3000, amount_refunded: 1000, currency: 'usd', refunded: false };
  const res = await POST(request(event('charge.refunded', charge, 'evt_r2')));
  assert.equal(res.status, 200);
  assert.ok(!db.calls.some((c) => c.table === 'vsyc_registrations' && c.op === 'update'));
  assert.equal(audits[0][0], 'payment_partially_refunded');
});

test('a handler that throws answers 500 so Stripe retries, and the error is kept', async () => {
  stubs.set('payments', { applyPaidSession: async () => { throw new Error('db down'); } });
  const res = await POST(request(event('checkout.session.completed', { id: 'cs_1' })));
  assert.equal(res.status, 500);
  assert.ok(db.calls.some((c) => c.op === 'update' && /db down/.test(c.patch.last_error ?? '')));
});

test('event types the app does not handle are recorded and acknowledged', async () => {
  const res = await POST(request(event('customer.created', { id: 'cus_1' }, 'evt_x')));
  assert.equal(res.status, 200);
  assert.deepEqual(applied, []);
  assert.deepEqual(disputes, []);
});
