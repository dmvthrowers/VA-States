// Sponsor pipeline totals: only committed and paid money counts. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDeliverables, summarizeSponsors } from './sponsors.ts';

test('only committed and paid sponsors count toward pledged money', () => {
  const s = summarizeSponsors([
    { status: 'prospect', amount_cents: 500000 },
    { status: 'contacted', amount_cents: 100000 },
    { status: 'committed', amount_cents: 25000, deliverables: [{ label: 'Banner', done: true }, { label: 'Shout-out', done: false }] },
    { status: 'paid', amount_cents: 75000, deliverables: [{ label: 'Logo', done: true }] },
    { status: 'declined', amount_cents: 999900, deliverables: [{ label: 'x', done: false }] },
  ]);
  assert.equal(s.pledgedCents, 100000);
  assert.equal(s.paidCents, 75000);
  assert.equal(s.outstandingCents, 25000);
  assert.deepEqual(s.counts, { prospect: 1, contacted: 1, committed: 1, paid: 1, declined: 1 });
  assert.equal(s.deliverablesDone, 2);
  assert.equal(s.deliverablesTotal, 3); // declined sponsors owe nothing
});

test('an empty list summarizes to zeros', () => {
  const s = summarizeSponsors([]);
  assert.equal(s.pledgedCents, 0);
  assert.equal(s.deliverablesTotal, 0);
});

test('cleanDeliverables trims, drops blanks and junk, and caps at 20', () => {
  assert.deepEqual(cleanDeliverables([{ label: '  Banner ', done: true }, { label: '   ' }, null, { label: 5 }, { label: 'Social post' }]),
    [{ label: 'Banner', done: true }, { label: 'Social post', done: false }]);
  assert.deepEqual(cleanDeliverables('nope'), []);
  assert.equal(cleanDeliverables(Array.from({ length: 30 }, (_, i) => ({ label: `d${i}` }))).length, 20);
});
