// Unit tests for lib/standings.ts with the VSYC-26 divisions (no network or DB).
// Run: npm test
//
// lib/standings.ts imports with the `@/` alias like the rest of the app, so this file registers
// a tiny resolve hook that maps `@/x` to `<repo>/x.ts` before importing it.
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

const S = await import('./standings.ts');

const R = (registration_id, division, final_score) =>
  ({ registration_id, division, round: 1, display_name: registration_id, city: null, state: null, final_score });

test('freestyle: judges are averaged and ranked high to low, as VSYC-26 was', () => {
  const st = S.computeStandings({
    results: [
      R('a', '1A', 80), R('a', '1A', '90'), // 85
      R('b', '1A', 95), R('b', '1A', 70),   // 82.5
      R('c', '1A', 88),                     // 88
      R('x1', 'X', 50), R('s1', 'SBJ', 40),
    ],
  });
  assert.deepEqual(st['1A'].final.map((r) => [r.place, r.registration_id, r.value]), [[1, 'c', 88], [2, 'a', 85], [3, 'b', 82.5]]);
  assert.equal(st['1A'].final[1].value_label, '85.00');
  assert.equal(st.X.final.length, 1);
  assert.equal(st.SBJ.final.length, 1);
});

test('ties share a place', () => {
  const st = S.computeStandings({ results: [R('a', 'SBJ', 60), R('b', 'SBJ', 60), R('c', 'SBJ', 50)] });
  assert.deepEqual(st.SBJ.final.map((r) => r.place), [1, 1, 3]);
});

test('negative finals still rank (1A allows negative clicks)', () => {
  const st = S.computeStandings({ results: [R('a', '1A', -2.57), R('b', '1A', -2.01), R('c', '1A', 2.83)] });
  assert.deepEqual(st['1A'].final.map((r) => r.registration_id), ['c', 'b', 'a']);
});

test('winner survey invites: top 3 per division', () => {
  const results = ['a', 'b', 'c', 'd'].flatMap((id, i) => [R(id, '1A', 90 - i), R(`x${id}`, 'X', 80 - i)]);
  const winners = S.winnersFrom(S.computeStandings({ results }));
  assert.deepEqual(winners.map((w) => [w.division, w.place, w.registration_id]),
    [['1A', 1, 'a'], ['1A', 2, 'b'], ['1A', 3, 'c'], ['X', 1, 'xa'], ['X', 2, 'xb'], ['X', 3, 'xc']]);
});
