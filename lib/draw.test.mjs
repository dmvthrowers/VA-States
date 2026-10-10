// Published draws (master plan P4). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawOrder, verifyDraw, newSeed, checkDrawMeta, SEED_PATTERN } from './draw.ts';

const ids = ['d', 'b', 'a', 'c', 'e', 'f', 'g', 'h'];

test('same seed, same order, whatever order the ids arrive in', () => {
  assert.deepEqual(drawOrder(ids, 'abcd-1234'), drawOrder([...ids].reverse(), 'abcd-1234'));
});

test('known vector (guards against engine or code drift)', () => {
  assert.equal(drawOrder(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'vsyc-26').join(''), 'ecbgadhf');
});

test('different seeds give different orders, and every id appears once', () => {
  const a = drawOrder(ids, 'seed-aaaa');
  const b = drawOrder(ids, 'seed-bbbb');
  assert.notDeepEqual(a, b);
  assert.deepEqual([...a].sort(), [...ids].sort());
});

test('draws are roughly fair: each id lands first about equally often', () => {
  const firsts = {};
  for (let i = 0; i < 4000; i++) {
    const first = drawOrder(['a', 'b', 'c', 'd'], `trial-${i}`)[0];
    firsts[first] = (firsts[first] ?? 0) + 1;
  }
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(firsts[id] > 800 && firsts[id] < 1200, `${id}: ${firsts[id]}`);
});

test('verifyDraw accepts the draw and rejects a tweak', () => {
  const order = drawOrder(ids, 'abcd-1234');
  assert.equal(verifyDraw(order, 'abcd-1234'), true);
  const tweaked = [...order];
  [tweaked[0], tweaked[1]] = [tweaked[1], tweaked[0]];
  assert.equal(verifyDraw(tweaked, 'abcd-1234'), false);
  assert.equal(verifyDraw(order, 'abcd-9999'), false);
});

test('newSeed matches the seed pattern and is not constant', () => {
  const s = newSeed();
  assert.match(s, SEED_PATTERN);
  assert.notEqual(s, newSeed());
});

test('checkDrawMeta', () => {
  const order = drawOrder(ids, 'abcd-1234');
  assert.equal(checkDrawMeta(undefined, order, false), null);
  assert.match(checkDrawMeta(undefined, order, true), /Say how/);
  assert.equal(checkDrawMeta({ method: 'random', seed: 'abcd-1234' }, order, true), null);
  assert.match(checkDrawMeta({ method: 'random', seed: 'abcd-1234' }, [...order].reverse(), true), /isn't what the seed/);
  assert.match(checkDrawMeta({ method: 'random' }, order, true), /needs its seed/);
  assert.match(checkDrawMeta({ method: 'rule', rule: ' ' }, order, true), /rule/);
  assert.equal(checkDrawMeta({ method: 'rule', rule: 'Reverse rank from round 1' }, order, true), null);
  assert.match(checkDrawMeta({ method: 'manual', reason: 'hi' }, order, true), /reason/);
  assert.equal(checkDrawMeta({ method: 'manual', reason: 'Player has a travel conflict' }, order, true), null);
});
