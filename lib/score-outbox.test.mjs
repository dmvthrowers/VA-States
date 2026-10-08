// Unit tests for the judge page's score outbox (offline-safe scoring). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOX_KEY, entryId, loadOutbox, enqueue, markSent, markFailed, classify, sendOrder,
} from './score-outbox.ts';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const body = (reg, extra = {}) => ({ registration_id: reg, division: '1A', round: 1, tech_execution_raw: 10, ...extra });

test('a saved score survives a reload', () => {
  const s = memory();
  enqueue(s, body('r1'), 1000);
  const again = loadOutbox(s);
  assert.equal(again.length, 1);
  assert.equal(again[0].id, entryId('r1', '1A', 1));
  assert.equal(again[0].lastError, null);
});

test('a newer score for the same performer replaces the unsent one', () => {
  const s = memory();
  enqueue(s, body('r1', { tech_execution_raw: 10 }), 1000);
  enqueue(s, body('r1', { tech_execution_raw: 12 }), 2000);
  const list = loadOutbox(s);
  assert.equal(list.length, 1);
  assert.equal(list[0].body.tech_execution_raw, 12);
});

test('different rounds and performers are kept apart', () => {
  const s = memory();
  enqueue(s, body('r1'), 1);
  enqueue(s, body('r2'), 2);
  enqueue(s, body('r1', { round: 2 }), 3);
  assert.equal(loadOutbox(s).length, 3);
});

test('markSent removes only the version that was sent', () => {
  const s = memory();
  enqueue(s, body('r1', { tech_execution_raw: 10 }), 1000);
  // The judge edits the score while the first send is in flight.
  enqueue(s, body('r1', { tech_execution_raw: 12 }), 2000);
  markSent(s, entryId('r1', '1A', 1), 1000);
  const left = loadOutbox(s);
  assert.equal(left.length, 1, 'the newer edit still has to be sent');
  assert.equal(left[0].body.tech_execution_raw, 12);
  markSent(s, entryId('r1', '1A', 1), 2000);
  assert.equal(loadOutbox(s).length, 0);
});

test('markFailed records the problem without dropping the score', () => {
  const s = memory();
  enqueue(s, body('r1'), 1);
  markFailed(s, entryId('r1', '1A', 1), 'No connection');
  assert.equal(loadOutbox(s)[0].lastError, 'No connection');
});

test('classify: network trouble and server errors retry; validation errors do not', () => {
  assert.equal(classify(null), 'retry');
  assert.equal(classify(200), 'sent');
  assert.equal(classify(201), 'sent');
  assert.equal(classify(401), 'signed-out');
  assert.equal(classify(403), 'signed-out');
  assert.equal(classify(408), 'retry');
  assert.equal(classify(429), 'retry');
  assert.equal(classify(500), 'retry');
  assert.equal(classify(503), 'retry');
  assert.equal(classify(400), 'rejected');
  assert.equal(classify(422), 'rejected');
});

test('sendOrder sends oldest first', () => {
  const s = memory();
  enqueue(s, body('r2'), 2000);
  enqueue(s, body('r1'), 1000);
  assert.deepEqual(sendOrder(loadOutbox(s)).map((e) => e.body.registration_id), ['r1', 'r2']);
});

test('broken or missing storage never throws', () => {
  assert.deepEqual(loadOutbox(null), []);
  const s = memory();
  s.setItem(OUTBOX_KEY, '{not json');
  assert.deepEqual(loadOutbox(s), []);
  s.setItem(OUTBOX_KEY, JSON.stringify([{ nope: true }, 5]));
  assert.deepEqual(loadOutbox(s), []);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(enqueue(full, body('r1'), 1).length, 1, 'still returns the list for this visit');
});
