// Scores-in board (master plan T1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScoreStatus } from './score-status.ts';
import { buildScoresInBoard, owedBy, owedLine } from './scores-in-board.ts';

const E = (id, status = 'done') => ({ registration_id: id, name: id.toUpperCase(), run_status: status });
const S = (id, judge, score) => ({ registration_id: id, judge_key: judge, judge_name: judge.toUpperCase(), score });

const status = computeScoreStatus(
  [E('a'), E('b'), E('c', 'upcoming')],
  [S('a', 'j1', 80), S('a', 'j2', 82), S('b', 'j1', 70)],
);

test('grid has one cell per judge per competitor', () => {
  const b = buildScoresInBoard(status);
  assert.deepEqual(b.judges, ['J1', 'J2']);
  assert.deepEqual(b.rows.map((r) => r.cells), [[true, true], [true, false], [false, false]]);
  assert.equal(b.total, 6);
  assert.equal(b.filled, 3);
  assert.equal(b.percent, 50);
  assert.equal(b.full, false);
});

test('empty round is not full', () => {
  const b = buildScoresInBoard(computeScoreStatus([], []));
  assert.equal(b.total, 0);
  assert.equal(b.percent, 0);
  assert.equal(b.full, false);
});

test('full when every judge has scored every competitor', () => {
  const b = buildScoresInBoard(computeScoreStatus([E('a')], [S('a', 'j1', 1), S('a', 'j2', 2)]));
  assert.equal(b.full, true);
  assert.equal(b.percent, 100);
});

test('owedBy counts only performers who are done', () => {
  assert.deepEqual(owedBy(status, 'J2'), ['B']);
  assert.deepEqual(owedBy(status, 'J1'), []);
  assert.deepEqual(owedBy(status, 'Nobody'), []);
});

test('owedLine wording', () => {
  assert.equal(owedLine([]), null);
  assert.equal(owedLine(['Ana']), 'You still owe Ana.');
  assert.equal(owedLine(['Ana', 'Ben']), 'You still owe Ana and Ben.');
  assert.equal(owedLine(['A', 'B', 'C']), 'You still owe A, B and C.');
  assert.equal(owedLine(['A', 'B', 'C', 'D', 'E']), 'You still owe A, B, C and 2 more.');
});
