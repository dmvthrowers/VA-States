// Age split of a big division (site #81): when it splits and where the suggested cut falls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageSpread, countAtCut, previewSplit, splitCandidates } from './division-split.ts';

const rule = { above: 15, minBracket: 5 };
const kids = [8, 9, 9, 10, 11, 12, 12, 13];
const adults = [24, 28, 31, 35, 40, 44, 52, 58];

test('15 or fewer stay one division', () => {
  const p = previewSplit([...kids.slice(0, 7), ...adults.slice(0, 8)], rule);
  assert.equal(p.entrants, 15);
  assert.equal(p.shouldSplit, false);
  assert.equal(p.reason, 'few_entrants');
  assert.equal(p.cutAge, null);
});

test('16 players with a clear kid/adult line split at that line', () => {
  const p = previewSplit([...kids, ...adults], rule);
  assert.equal(p.entrants, 16);
  assert.equal(p.shouldSplit, true);
  assert.equal(p.reason, 'ok');
  assert.equal(p.cutAge, 13); // biggest jump: 13 -> 24
  assert.deepEqual([p.younger, p.older], [8, 8]);
});

test('a cut that leaves a bracket under the minimum is never suggested', () => {
  // 14 adults and 2 kids: no cut leaves 5 on each side that has a real gap, so the best allowed cut is inside the adults
  const ages = [9, 10, 25, 26, 27, 28, 30, 31, 33, 35, 38, 40, 41, 44, 50, 55];
  const c = splitCandidates(ages, 5);
  assert.ok(c.every((x) => x.younger >= 5 && x.older >= 5));
  assert.ok(!c.some((x) => x.cutAge === 10));
});

test('when no cut leaves both brackets big enough, do not split', () => {
  const ages = Array.from({ length: 16 }, (_, i) => 30 + (i % 2)); // 8 x 30, 8 x 31 -> a 30/31 cut gives 8/8
  assert.equal(previewSplit(ages, rule).shouldSplit, true);
  const same = Array.from({ length: 16 }, () => 30); // everyone the same age: no cut exists
  const p = previewSplit(same, rule);
  assert.equal(p.shouldSplit, false);
  assert.equal(p.reason, 'too_small');
  assert.deepEqual(p.candidates, []);
});

test('equal gaps are broken by the cut nearest the mean age, then the lower cut', () => {
  const ages = [10, 10, 10, 10, 10, 12, 12, 12, 12, 12, 14, 14, 14, 14, 14, 14]; // gaps of 2 at 10|12 and 12|14
  const p = previewSplit(ages, rule);
  assert.equal(p.shouldSplit, true);
  assert.equal(p.candidates[0].gap, 2);
  assert.equal(p.candidates.length, 2);
  assert.equal(p.cutAge, 12); // mean 12.1: the 12|14 midpoint (13) is closer than 10|12 (11)
});

test("the organizer's own cut is previewed, even if it leaves a small bracket", () => {
  const ages = [...kids, ...adults];
  const p = previewSplit(ages, rule, 9);
  assert.equal(p.cutAge, 9);
  assert.deepEqual([p.younger, p.older], [3, 13]);
  assert.equal(p.shouldSplit, false);
  assert.equal(p.reason, 'too_small');
  const ok = previewSplit(ages, rule, 12);
  assert.equal(ok.shouldSplit, true);
  assert.deepEqual([ok.younger, ok.older], [7, 9]);
});

test('spread: min, max, mean and median', () => {
  assert.deepEqual(ageSpread([10, 20, 30, 40]), { min: 10, max: 40, mean: 25, median: 25 });
  assert.deepEqual(ageSpread([5, 7, 9]), { min: 5, max: 9, mean: 7, median: 7 });
  assert.equal(ageSpread([]), null);
});

test('countAtCut counts age <= cut as younger', () => {
  assert.deepEqual(countAtCut([10, 12, 12, 14], 12), { younger: 3, older: 1 });
});
