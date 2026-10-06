// Prizes that change with scope: podium size by entrants, champion prize, totals. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { championPrize, placesFor, prizeIssues, prizePlan, prizeRules } from './prizes.ts';

const D = (code, prizes, format = 'freestyle') => ({ code, name: code, prizes, scoring: { format } });
const defaults = { places: 3, championState: 'VA' };

test('without tiers the contest default applies', () => {
  assert.equal(placesFor(undefined, 40, 3), 3);
  assert.equal(placesFor({}, 2, 3), 3);
  assert.equal(placesFor({ tiers: [] }, 2, 3), 3);
});

test('tiers by entrants: first whose upTo covers the count', () => {
  const p = { tiers: [{ upTo: 4, places: 1 }, { upTo: 9, places: 2 }, { places: 3 }] };
  assert.deepEqual([0, 1, 4].map((n) => placesFor(p, n, 3)), [1, 1, 1]);
  assert.deepEqual([5, 9].map((n) => placesFor(p, n, 3)), [2, 2]);
  assert.deepEqual([10, 80].map((n) => placesFor(p, n, 3)), [3, 3]);
});

test('a tier can give no podium prizes at all', () => {
  assert.equal(placesFor({ tiers: [{ upTo: 2, places: 0 }, { places: 3 }] }, 2, 3), 0);
});

test('the champion prize needs a champion state and no opt-out', () => {
  assert.equal(championPrize(undefined, 'VA'), true);
  assert.equal(championPrize({ champion: false }, 'VA'), false);
  assert.equal(championPrize(undefined, ''), false);
  assert.equal(championPrize(undefined, '  '), false);
});

test('three divisions with the default: 9 podium + 3 champions = 12', () => {
  const plan = prizePlan([D('1A'), D('X'), D('SBJ')], { '1A': 40, X: 25, SBJ: 20 }, defaults);
  assert.deepEqual([plan.podium, plan.champions, plan.total], [9, 3, 12]);
  assert.deepEqual(plan.rows.map((r) => r.prizes), [4, 4, 4]);
});

test('scope changes the total: a small division gives fewer prizes, and Sport splitting adds divisions', () => {
  const small = { tiers: [{ upTo: 5, places: 1 }, { upTo: 10, places: 2 }, { places: 3 }] };
  const plan = prizePlan([D('1A', small), D('X', small), D('SBJ', small)], { '1A': 40, X: 8, SBJ: 3 }, defaults);
  assert.deepEqual(plan.rows.map((r) => r.places), [3, 2, 1]);
  assert.equal(plan.total, 6 + 3);
  // Sport splits into two brackets, each its own division: 4 divisions
  const split = prizePlan([D('1A'), D('X'), D('SBJ-Y'), D('SBJ-A')], { '1A': 40, X: 25, 'SBJ-Y': 8, 'SBJ-A': 12 }, defaults);
  assert.equal(split.total, 16);
});

test('showcase divisions have no prizes, and a division can skip the champion prize', () => {
  const plan = prizePlan([D('1A'), D('SHOW', undefined, 'showcase'), D('X', { champion: false })], { '1A': 5, X: 5 }, defaults);
  assert.deepEqual(plan.rows.map((r) => r.division), ['1A', 'X']);
  assert.deepEqual([plan.podium, plan.champions, plan.total], [6, 1, 7]);
});

test('prizeRules answers per division for winnersFrom', () => {
  const rules = prizeRules([D('1A', { tiers: [{ upTo: 4, places: 1 }, { places: 3 }] }), D('X', { champion: false })], defaults);
  assert.equal(rules.places('1A', 3), 1);
  assert.equal(rules.places('1A', 30), 3);
  assert.equal(rules.places('X', 3), 3);
  assert.equal(rules.places('unknown', 3), 3);
  assert.equal(rules.champion('1A'), true);
  assert.equal(rules.champion('X'), false);
});

test('prizeIssues catches mistakes', () => {
  assert.deepEqual(prizeIssues(D('1A')), []);
  assert.deepEqual(prizeIssues(D('1A', { tiers: [{ upTo: 4, places: 1 }, { places: 3 }] })), []);
  assert.match(prizeIssues(D('1A', { tiers: [{ upTo: 9, places: 2 }, { upTo: 4, places: 1 }, { places: 3 }] })).join(), /increasing/);
  assert.match(prizeIssues(D('1A', { tiers: [{ places: 1 }, { upTo: 9, places: 2 }] })).join(), /only the last/);
  assert.match(prizeIssues(D('1A', { tiers: [{ upTo: 4, places: 1 }] })).join(), /last prizes tier should leave out upTo/);
  assert.match(prizeIssues(D('1A', { tiers: [{ places: -1 }] })).join(), /whole number from 0 to 10/);
});
