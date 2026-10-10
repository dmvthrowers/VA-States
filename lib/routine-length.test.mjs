// Unit tests for routine lengths: a round's own length wins over the division's, with validation.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competition } from '../contest.config.ts';
import { configIssues, routineSecondsOf, formatRoutineTime } from './divisions-core.ts';

const base = {
  code: 'A', name: 'A', description: '', priceCents: 0, music: true,
  scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: null },
};

test('no length set means null', () => {
  assert.equal(routineSecondsOf(base), null);
  assert.equal(routineSecondsOf(undefined), null);
});

test('a round\'s own length wins over the division default, and later rounds can be longer', () => {
  const d = {
    ...base, routineSeconds: 60,
    rounds: [{ name: 'Prelims', advance: 10, seconds: 60 }, { name: 'Semis', advance: 5, seconds: 90 }, { name: 'Final', seconds: 180 }],
  };
  assert.deepEqual([1, 2, 3].map((r) => routineSecondsOf(d, r)), [60, 90, 180]);
  const noOwn = { ...d, rounds: [{ name: 'Prelims', advance: 10 }, { name: 'Final' }] };
  assert.deepEqual([1, 2].map((r) => routineSecondsOf(noOwn, r)), [60, 60]);
  assert.equal(routineSecondsOf({ ...noOwn, routineSeconds: undefined }, 1), null);
  assert.deepEqual(configIssues({ ...competition, divisions: [d], combos: [] }), []);
});

test('bad routine lengths are caught', () => {
  const issues = (extra) => configIssues({ ...competition, divisions: [{ ...base, ...extra }], combos: [] });
  assert.ok(issues({ routineSeconds: 0 }).some((m) => /routineSeconds/.test(m)));
  assert.ok(issues({ routineSeconds: 90.5 }).some((m) => /routineSeconds/.test(m)));
  assert.ok(issues({ rounds: [{ name: 'Final', seconds: 99999 }] }).some((m) => /seconds must be/.test(m)));
});

test('formatRoutineTime', () => {
  assert.deepEqual([60, 90, 120, 180, 5, 0].map(formatRoutineTime), ['1:00', '1:30', '2:00', '3:00', '0:05', '0:00']);
});
