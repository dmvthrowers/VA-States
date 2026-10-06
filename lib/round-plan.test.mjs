// Round plans by entrant count (site issue #80): tiers, skipped rounds, advancement cut and ties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const root = new URL('../', import.meta.url).href;
const hook = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = ${JSON.stringify(root)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
      const url = new URL(spec.slice(2) + ext, ROOT);
      if (existsSync(fileURLToPath(url)) && !url.pathname.endsWith('/')) return { url: url.href, shortCircuit: true };
    }
  }
  return next(spec, ctx);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);


const P = await import('./round-plan.ts');

const r = (name, seconds) => ({ name, seconds });
// The #80 rules: 1A prelims 1:00, semi-final 1:30, final 3:00.
const oneA = {
  code: '1A', name: '1A', rounds: [r('Prelims', 60), r('Semi-final', 90), r('Final', 180)],
  roundPlan: [
    { upTo: 25, rounds: [{ key: 'final' }] },
    { upTo: 50, rounds: [{ key: 'prelims', advance: 15 }, { key: 'final' }] },
    { rounds: [{ key: 'prelims', advance: 20 }, { key: 'semi-final', advance: 10 }, { key: 'final' }] },
  ],
  scoring: { format: 'freestyle' },
};

test('tiers by entrant count: 25, 26, 50, 51', () => {
  assert.deepEqual([0, 1, 25].map((n) => P.suggestPlan(oneA, n).tier), [0, 0, 0]);
  assert.deepEqual([26, 50].map((n) => P.suggestPlan(oneA, n).tier), [1, 1]);
  assert.deepEqual([51, 200].map((n) => P.suggestPlan(oneA, n).tier), [2, 2]);
});

test('skipped rounds keep their numbers', () => {
  assert.deepEqual(P.suggestPlan(oneA, 20).rounds, [{ round: 3, key: 'final', advance: null }]);
  assert.deepEqual(P.suggestPlan(oneA, 40).rounds.map((x) => [x.round, x.advance]), [[1, 15], [3, null]]);
  assert.deepEqual(P.suggestPlan(oneA, 60).rounds.map((x) => [x.round, x.advance]), [[1, 20], [2, 10], [3, null]]);
});

test('round active, next round and advance count follow the plan', () => {
  const p40 = P.suggestPlan(oneA, 40);
  assert.equal(P.isRoundActive(oneA, p40, 2), false);
  assert.equal(P.isRoundActive(oneA, p40, 3), true);
  assert.equal(P.nextActiveRound(oneA, p40, 1), 3);
  assert.equal(P.nextActiveRound(oneA, p40, 3), null);
  assert.equal(P.advanceCount(oneA, p40, 1), 15);
  assert.equal(P.advanceCount(oneA, p40, 3), null);
  const p60 = P.suggestPlan(oneA, 60);
  assert.equal(P.advanceCount(oneA, p60, 2), 10);
});

test('before a plan is confirmed every round counts, and the round\'s own advance is used', () => {
  assert.deepEqual(P.activeRounds(oneA, null), [1, 2, 3]);
  const plain = { code: 'X', name: 'X', rounds: [{ name: 'Prelims', advance: 8 }, { name: 'Final' }], scoring: { format: 'freestyle' } };
  assert.equal(P.advanceCount(plain, null, 1), 8);
  assert.equal(P.suggestPlan(plain, 99), null);
  assert.equal(P.isRoundActive(plain, null, 2), true);
  assert.equal(P.isRoundActive(plain, null, 3), false);
});

test('cutAt: no tie, tie that fits, tie across the cut', () => {
  const rk = (...vals) => vals.map((v, i) => ({ registration_id: 'p' + i, value: v }));
  // no tie at the cut
  let c = P.cutAt(rk(90, 80, 70, 60), 2);
  assert.deepEqual([c.clear.length, c.tied.length, c.outside.length], [2, 0, 2]);
  // tie sits right at the cut: 3rd and 4th share 70 for the last 1 slot after two clear
  c = P.cutAt(rk(90, 80, 70, 70, 60), 3);
  assert.deepEqual([c.clear.length, c.tied.length, c.outside.length, c.slots], [2, 2, 1, 1]);
  // tie entirely inside the top: both 80s are in
  c = P.cutAt(rk(90, 80, 80, 70), 3);
  assert.deepEqual([c.clear.length, c.tied.length, c.outside.length], [3, 0, 1]);
  // fewer than the count
  c = P.cutAt(rk(90, 80), 5);
  assert.deepEqual([c.clear.length, c.outside.length], [2, 0]);
  // three tied for two slots after one clear
  c = P.cutAt(rk(90, 70, 70, 70, 50), 3);
  assert.deepEqual([c.clear.length, c.tied.length, c.slots], [1, 3, 2]);
});

test('the plan is described for players', () => {
  assert.deepEqual(P.describeRoundPlan(oneA), [
    '25 or fewer: final only (3:00).',
    '26–50: prelims (1:00, top 15 advance), then final (3:00).',
    'More than 50: prelims (1:00, top 20 advance), then semi-final (1:30, top 10 advance), then final (3:00).',
  ]);
});

test('roundPlanIssues catches mistakes', () => {
  assert.deepEqual(P.roundPlanIssues(oneA), []);
  const bad = (plan) => P.roundPlanIssues({ ...oneA, roundPlan: plan });
  assert.match(bad([{ rounds: [{ key: 'nope' }] }])[0], /unknown round "nope"/);
  assert.match(bad([{ upTo: 50, rounds: [{ key: 'final' }] }, { upTo: 25, rounds: [{ key: 'final' }] }]).join(), /increasing/);
  assert.match(bad([{ rounds: [{ key: 'prelims' }, { key: 'final' }] }]).join(), /needs an advance count/);
  assert.match(bad([{ rounds: [{ key: 'final', advance: 3 }] }]).join(), /last round can't advance/);
  assert.match(bad([{ rounds: [{ key: 'final' }, { key: 'prelims', advance: 3 }] }]).join(), /out of order/);
  assert.match(bad([{ upTo: 25, rounds: [{ key: 'final' }] }]).join(), /leave out upTo/);
});
