import test from 'node:test';
import assert from 'node:assert/strict';
import { battleCue, cueOrder } from './battle-cue.ts';

const m = (round, position, a, b, extra = {}) => ({
  id: `${round}-${position}${extra.is_third_place ? 't' : ''}`, round, position, is_third_place: false,
  entry_a: a, entry_b: b, winner: null, status: 'pending', ...extra,
});

const bracket = () => [
  m(1, 1, 'a', 'b'), m(1, 2, 'c', 'd'),
  m(2, 1, null, null),
  m(2, 2, null, null, { is_third_place: true }),
];

test('cue order puts the third-place match before the final', () => {
  // The third-place match shares the final's round (position 2); it plays first.
  assert.deepEqual(cueOrder(bracket()).map((x) => x.id), ['1-1', '1-2', '2-2t', '2-1']);
});

test('the live match wins, even if an earlier one is waiting', () => {
  const ms = bracket();
  ms[1].status = 'live';
  assert.equal(battleCue(ms).id, '1-2');
});

test('with nothing live, the first playable match is next', () => {
  assert.equal(battleCue(bracket()).id, '1-1');
});

test('decided matches and matches missing an entrant are skipped', () => {
  const ms = bracket();
  ms[0].winner = 'a';
  ms[0].status = 'done';
  assert.equal(battleCue(ms).id, '1-2');
  ms[1].winner = 'c';
  assert.equal(battleCue(ms), null);
});

test('a live match that was already decided does not hold the cue', () => {
  const ms = bracket();
  ms[0].status = 'live';
  ms[0].winner = 'a';
  assert.equal(battleCue(ms).id, '1-2');
});
