// Open books (master plan O4). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBooks, entryIssue, BUDGET_CATEGORIES } from './open-books.ts';

const E = (entry_type, category, amount_cents, planned = false) => ({ entry_type, category, amount_cents, planned });

test('planned and actual sit side by side, per category', () => {
  const b = buildBooks([
    E('income', 'sponsor', 50000, true), E('income', 'sponsor', 30000),
    E('expense', 'venue', 20000, true), E('expense', 'venue', 25000), E('expense', 'prizes', 10000),
  ], 120000);
  const sponsor = b.income.find((l) => l.category === 'sponsor');
  assert.deepEqual([sponsor.planned_cents, sponsor.actual_cents], [50000, 30000]);
  const venue = b.expense.find((l) => l.category === 'venue');
  assert.deepEqual([venue.planned_cents, venue.actual_cents], [20000, 25000]);
});

test('registration income is the live figure, planned registration is separate', () => {
  const b = buildBooks([E('income', 'registration', 200000, true)], 150000);
  const reg = b.income.find((l) => l.category === 'registration');
  assert.deepEqual([reg.planned_cents, reg.actual_cents], [200000, 150000]);
});

test('totals and net', () => {
  const b = buildBooks([E('income', 'sponsor', 30000), E('expense', 'venue', 25000), E('expense', 'venue', 5000, true)], 100000);
  assert.equal(b.totals.actual_income_cents, 130000);
  assert.equal(b.totals.actual_expense_cents, 25000);
  assert.equal(b.totals.actual_net_cents, 105000);
  assert.equal(b.totals.planned_expense_cents, 5000);
  assert.equal(b.totals.planned_net_cents, -5000);
  assert.equal(b.has_planned, true);
});

test('empty lines are dropped and has_planned is false with no plan', () => {
  const b = buildBooks([E('expense', 'food', 4000)], 0);
  assert.deepEqual(b.income, []);
  assert.deepEqual(b.expense.map((l) => l.category), ['food']);
  assert.equal(b.has_planned, false);
});

test('a planned entry never counts as actual', () => {
  const b = buildBooks([E('income', 'merch', 99900, true)], 0);
  assert.equal(b.totals.actual_income_cents, 0);
  assert.equal(b.totals.planned_income_cents, 99900);
});

test('registration entries: only planned income', () => {
  assert.equal(entryIssue({ entry_type: 'income', category: 'registration', planned: true }), null);
  assert.match(entryIssue({ entry_type: 'income', category: 'registration', planned: false }), /paid registrations/);
  assert.match(entryIssue({ entry_type: 'expense', category: 'registration', planned: true }), /income category/);
  assert.equal(entryIssue({ entry_type: 'expense', category: 'venue' }), null);
  assert.ok(BUDGET_CATEGORIES.includes('other'));
});
