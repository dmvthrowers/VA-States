// Release gates (master plan T2). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScoreStatus } from './score-status.ts';
import { evaluateReleaseGate, scoreFingerprint } from './release-gate.ts';

const E = (id) => ({ registration_id: id, name: id.toUpperCase(), run_status: 'done' });
const S = (id, judge, score) => ({ registration_id: id, judge_key: judge, judge_name: judge.toUpperCase(), score });
const full = computeScoreStatus([E('a')], [S('a', 'j1', 80), S('a', 'j2', 82)]);
const gap = computeScoreStatus([E('a'), E('b')], [S('a', 'j1', 80), S('a', 'j2', 82), S('b', 'j1', 70)]);
const check = (st) => ({ checked_by: 'head@x.org', checked_at: '2026-09-19T20:00:00Z', fingerprint: scoreFingerprint(st) });

test('gates off: always open', () => {
  const v = evaluateReleaseGate({ enabled: false, status: gap, check: null });
  assert.equal(v.open, true);
  assert.deepEqual(v.reasons, []);
});

test('missing scores shut the gate and say why', () => {
  const v = evaluateReleaseGate({ enabled: true, status: gap, check: check(gap) });
  assert.equal(v.open, false);
  assert.ok(v.reasons.some((r) => r.includes('B is missing J2')));
});

test('full board but not checked: shut', () => {
  const v = evaluateReleaseGate({ enabled: true, status: full, check: null });
  assert.equal(v.open, false);
  assert.deepEqual(v.reasons, ['The head judge has not checked these scores yet.']);
});

test('full board and checked: open', () => {
  const v = evaluateReleaseGate({ enabled: true, status: full, check: check(full) });
  assert.equal(v.open, true);
  assert.equal(v.checked, true);
});

test('a score edited after the check reopens the gate', () => {
  const stamp = check(full);
  const edited = computeScoreStatus([E('a')], [S('a', 'j1', 81), S('a', 'j2', 82)]);
  const v = evaluateReleaseGate({ enabled: true, status: edited, check: stamp });
  assert.equal(v.open, false);
  assert.equal(v.checked, false);
  assert.match(v.reasons[0], /changed after/);
});

test('unreadable scores shut the gate', () => {
  assert.equal(evaluateReleaseGate({ enabled: true, status: null, check: null }).open, false);
});
