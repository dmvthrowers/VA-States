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

test('VA State Champion: best-placed Virginian per division, even off the podium (VSYC-26 rule)', () => {
  const row = (registration_id, place, state) => ({ registration_id, place, state, display_name: registration_id, city: null, value: 0, value_label: '0' });
  // VSYC-26 1A: all 9 podium spots went out of state; the top Virginian was 13th.
  const rows = [row('a', 1, 'MD'), row('b', 2, 'CO'), row('c', 3, 'OH'), row('va13', 13, 'VA'), row('va16', 16, 'VA')];
  assert.deepEqual(S.stateChampions(rows, 'VA').map((r) => r.registration_id), ['va13']);
  const tied = [row('a', 1, 'VA'), row('b', 1, 'VA'), row('c', 3, 'VA')];
  assert.deepEqual(S.stateChampions(tied, 'VA').map((r) => r.registration_id), ['a', 'b']);
  assert.deepEqual(S.stateChampions(rows, 'TX'), []);
  assert.deepEqual(S.stateChampions(rows, ''), []);
});

const crow = (registration_id, place, state) => ({ registration_id, place, state, display_name: registration_id, city: null, value: 0, value_label: '0' });

test('champion by eligibility: a Virginian who has not confirmed a home address is skipped, an override counts', () => {
  const rows = [crow('a', 1, 'MD'), crow('va2', 2, 'VA'), crow('dc3', 3, 'DC'), crow('va5', 5, 'VA')];
  // va2 is not confirmed; va5 is. dc3 was made eligible by an organizer.
  assert.deepEqual(S.stateChampions(rows, 'VA', new Set(['va5'])).map((r) => r.registration_id), ['va5']);
  assert.deepEqual(S.stateChampions(rows, 'VA', new Set(['va5', 'dc3'])).map((r) => r.registration_id), ['dc3']);
  // nobody eligible -> no champion (not a fallback to the state field)
  assert.deepEqual(S.stateChampions(rows, 'VA', new Set()), []);
  // no eligibility set -> the old rule, by the state field
  assert.deepEqual(S.stateChampions(rows, 'VA').map((r) => r.registration_id), ['va2']);
});

test('prize winners: podium plus each division champion, who is marked even on the podium', () => {
  const results = ['a', 'b', 'c', 'd', 'e'].map((id, i) => R(id, '1A', 90 - i));
  const st = S.computeStandings({ results });
  const plain = S.winnersFrom(st);
  assert.deepEqual(plain.map((w) => w.registration_id), ['a', 'b', 'c']);
  // champion off the podium: 'e' (5th) is added as their own winner
  const off = S.winnersFrom(st, { state: 'VA', eligible: new Set(['e']) });
  assert.deepEqual(off.map((w) => [w.registration_id, w.place, !!w.champion]), [['a', 1, false], ['b', 2, false], ['c', 3, false], ['e', 5, true]]);
  // champion on the podium: marked, not duplicated
  const on = S.winnersFrom(st, { state: 'VA', eligible: new Set(['b']) });
  assert.deepEqual(on.map((w) => [w.registration_id, !!w.champion]), [['a', false], ['b', true], ['c', false]]);
  // eligibility unknown (null) falls back to the state field, which these rows don't have
  assert.deepEqual(S.winnersFrom(st, { state: 'VA', eligible: null }).map((w) => w.registration_id), ['a', 'b', 'c']);
});

test('prize winners follow the prize rules: podium size by entrants, champion opt-out', () => {
  const results = ['a', 'b', 'c', 'd', 'e'].flatMap((id, i) => [R(id, '1A', 90 - i), R(`x${id}`, 'X', 80 - i)]);
  const st = S.computeStandings({ results });
  // 1A: top 2 (5 entrants); X: top 1 and no champion prize.
  const rules = {
    places: (division) => (division === '1A' ? 2 : 1),
    champion: (division) => division !== 'X',
  };
  const w = S.winnersFrom(st, { state: 'VA', eligible: new Set(['e', 'xe']) }, rules);
  assert.deepEqual(w.map((x) => [x.division, x.registration_id, x.place, !!x.champion]),
    [['1A', 'a', 1, false], ['1A', 'b', 2, false], ['1A', 'e', 5, true], ['X', 'xa', 1, false]]);
  // the rules see how many placed
  const seen = [];
  S.winnersFrom(st, undefined, { places: (d, n) => { seen.push([d, n]); return 3; }, champion: () => true });
  assert.deepEqual(seen, [['1A', 5], ['X', 5], ['SBJ', 0]]);
});
