// Live score status and the ready-to-publish check (site #83). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScoreStatus, median } from './score-status.ts';

const E = (id, status = 'done') => ({ registration_id: id, name: id.toUpperCase(), run_status: status });
const S = (id, judge, score) => ({ registration_id: id, judge_key: judge, judge_name: judge.toUpperCase(), score });

test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('everyone scored by every judge and done: ready, nothing to flag', () => {
  const st = computeScoreStatus([E('a'), E('b')], [S('a', 'j1', 80), S('a', 'j2', 82), S('a', 'j3', 81), S('b', 'j1', 70), S('b', 'j2', 72), S('b', 'j3', 71)], { scale: 100 });
  assert.equal(st.ready, true);
  assert.deepEqual(st.blockers, []);
  assert.deepEqual(st.warnings, []);
  assert.equal(st.complete, 2);
  assert.deepEqual(st.judges, ['J1', 'J2', 'J3']);
  assert.equal(st.entrants[0].median, 81);
  assert.equal(st.entrants[0].spread, 2);
});

test('a missing judge score blocks, and names who and for whom', () => {
  const st = computeScoreStatus([E('a'), E('b')], [S('a', 'j1', 80), S('a', 'j2', 82), S('b', 'j1', 70)]);
  assert.equal(st.ready, false);
  assert.deepEqual(st.entrants[1].missing_judges, ['J2']);
  assert.ok(st.blockers.includes('B is missing J2.'));
  assert.equal(st.complete, 1);
});

test('a competitor who has not performed, or was never scored, blocks', () => {
  const st = computeScoreStatus([E('a'), E('b', 'upcoming'), E('c', 'performing'), E('d')], [S('a', 'j1', 80), S('a', 'j2', 82)]);
  assert.equal(st.ready, false);
  assert.ok(st.blockers.some((b) => /2 competitors have not finished performing: B, C/.test(b)));
  assert.ok(st.blockers.some((b) => /No scores for D/.test(b)));
});

test('no run order or no scores blocks', () => {
  assert.equal(computeScoreStatus([], [S('a', 'j1', 80)]).ready, false);
  assert.equal(computeScoreStatus([E('a')], []).ready, false);
});

test('an outlier is a warning, not a blocker, and needs at least three judges', () => {
  const st = computeScoreStatus([E('a')], [S('a', 'j1', 80), S('a', 'j2', 81), S('a', 'j3', 50)], { scale: 100 });
  assert.equal(st.ready, true);
  assert.equal(st.entrants[0].outliers.length, 1);
  assert.deepEqual(st.entrants[0].outliers[0], { judge_name: 'J3', score: 50, median: 80, diff: -30 });
  assert.ok(st.warnings.some((w) => /J3 gave A 50, 30 below the judges' median \(80\)/.test(w)));
  const two = computeScoreStatus([E('a')], [S('a', 'j1', 80), S('a', 'j2', 40)], { scale: 100 });
  assert.equal(two.entrants[0].outliers.length, 0);
  // no scale, no outliers
  assert.equal(computeScoreStatus([E('a')], [S('a', 'j1', 80), S('a', 'j2', 81), S('a', 'j3', 50)]).entrants[0].outliers.length, 0);
});

test('a score within the threshold is not an outlier', () => {
  const st = computeScoreStatus([E('a')], [S('a', 'j1', 80), S('a', 'j2', 81), S('a', 'j3', 68)], { scale: 100 });
  assert.equal(st.entrants[0].outliers.length, 0); // 12 below the median (80), under 15
});

test('one judge only, and scored people missing from the run order, are warnings', () => {
  const st = computeScoreStatus([E('a')], [S('a', 'j1', 80), S('zz', 'j1', 70)]);
  assert.equal(st.ready, true);
  assert.ok(st.warnings.some((w) => /Only one judge has scored \(J1\)/.test(w)));
  assert.ok(st.warnings.some((w) => /1 scored competitor is not in this round's run order/.test(w)));
});

test('long name lists are shortened', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => E(id, 'upcoming'));
  const st = computeScoreStatus(many, [S('x', 'j1', 1)]);
  assert.ok(st.blockers.some((b) => /A, B, C, D and 2 more/.test(b)));
});
