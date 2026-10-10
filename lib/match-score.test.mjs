// Bracket match scores (master plan F1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTarget, evaluateMatchScore, matchScoringLabel } from './match-score.ts';
import { scoringIssues } from './divisions-core.ts';

test('the final can play to a different number; third place and earlier rounds use `to`', () => {
  assert.equal(matchTarget({ to: 3, finalsTo: 5 }, true), 5);
  assert.equal(matchTarget({ to: 3, finalsTo: 5 }, false), 3);
  assert.equal(matchTarget({ to: 3 }, true), 3);
});

test('first to the target wins', () => {
  assert.deepEqual(evaluateMatchScore(3, 1, 3), { state: 'decided', winner: 'a', message: '' });
  assert.deepEqual(evaluateMatchScore(2, 3, 3), { state: 'decided', winner: 'b', message: '' });
  assert.equal(evaluateMatchScore(0, 3, 3).winner, 'b');
});

test('under the target is still in progress', () => {
  const o = evaluateMatchScore(2, 2, 3);
  assert.equal(o.state, 'in_progress');
  assert.equal(o.winner, null);
  assert.match(o.message, /First to 3/);
});

test('nothing entered is empty; one blank side counts as 0', () => {
  assert.equal(evaluateMatchScore(null, null, 3).state, 'empty');
  assert.equal(evaluateMatchScore(3, null, 3).winner, 'a');
});

test('over the target, both at the target, negatives and fractions are invalid', () => {
  assert.equal(evaluateMatchScore(4, 1, 3).state, 'invalid');
  assert.equal(evaluateMatchScore(3, 3, 3).state, 'invalid');
  assert.equal(evaluateMatchScore(-1, 2, 3).state, 'invalid');
  assert.equal(evaluateMatchScore(1.5, 2, 3).state, 'invalid');
  assert.equal(evaluateMatchScore(4, 1, 3).winner, null);
});

test('config checks (via scoringIssues)', () => {
  const div = (matchScoring) => ({ code: 'KEN', name: 'Ken', description: '', priceCents: 0, music: false, scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: false, matchScoring } });
  assert.deepEqual(scoringIssues(div(undefined)), []);
  assert.deepEqual(scoringIssues(div({ to: 3, finalsTo: 5 })), []);
  assert.equal(scoringIssues(div({ to: 0 })).length, 1);
  assert.equal(scoringIssues(div({ to: 3, finalsTo: 2.5 })).length, 1);
  assert.match(scoringIssues(div({ to: 100 }))[0], /matchScoring\.to/);
});

test('labels', () => {
  assert.equal(matchScoringLabel({ to: 3 }), 'First to 3');
  assert.equal(matchScoringLabel({ to: 3, finalsTo: 3 }), 'First to 3');
  assert.equal(matchScoringLabel({ to: 3, finalsTo: 5 }), 'First to 3, final first to 5');
});
