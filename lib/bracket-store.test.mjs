// Unit tests for lib/bracket-store.ts: bracket rows, winner changes, diffs, seeding, public names.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, setWinner, bracketPlacements } from './divisions-core.ts';
import {
  bracketRows, toMatches, changedRows, clearWinner, syncThirdPlace, hasRealWinner, isBye, mainRounds,
  secureShuffle, secureRandomInt, seedEntrants, extraLiveMatches, restrictedPublicName,
} from './bracket-store.ts';

/** Fake DB rows from buildBracket output, with ids and timestamps. */
function rowsFor(entrants, third = true) {
  return bracketRows('BATTLE', buildBracket(entrants, third)).map((r, i) => ({
    ...r, id: `m${i}`, updated_at: '2026-10-06T12:00:00.000000+00:00', votes_a: null, votes_b: null,
  }));
}
/** Apply patches like the route does. */
function apply(rows, patches) {
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const p of patches) Object.assign(byId.get(p.id), p.set);
  return [...byId.values()];
}
const at = (ms, round, position, third = false) => ms.find((m) => m.round === round && m.position === position && m.is_third_place === third);

test('bracketRows: every match of a 5-entrant bracket, byes done, rows satisfy the table checks', () => {
  const rows = bracketRows('BATTLE', buildBracket(['s1', 's2', 's3', 's4', 's5'], true));
  // 8-slot bracket: 4 + 2 + 1 + third place
  assert.equal(rows.length, 8);
  assert.equal(mainRounds(rows), 3);
  assert.equal(rows.filter((r) => r.is_third_place).length, 1);
  for (const r of rows) {
    assert.ok(r.round >= 1 && r.position >= 1);
    assert.ok(r.winner === null || r.winner === r.entry_a || r.winner === r.entry_b);
    assert.ok(['pending', 'live', 'done'].includes(r.status));
    assert.equal(r.status, r.winner ? 'done' : 'pending');
  }
  // Byes go to the top three seeds; only 4 vs 5 is a real first-round match.
  const r1 = rows.filter((r) => r.round === 1);
  assert.equal(r1.filter(isBye).length, 3);
  assert.equal(r1.filter((r) => r.entry_a && r.entry_b).length, 1);
  assert.equal(rows.some(hasRealWinner), false);
  // Unique (round, position, is_third_place)
  assert.equal(new Set(rows.map((r) => `${r.round}:${r.position}:${r.is_third_place}`)).size, rows.length);
});

test('toMatches copies rows; setWinner + changedRows saves the match and the next round', () => {
  const rows = rowsFor(['s1', 's2', 's3', 's4', 's5']);
  const ms = toMatches(rows);
  const real = ms.find((m) => m.round === 1 && m.entry_a && m.entry_b);
  setWinner(ms, real, real.entry_b);
  syncThirdPlace(ms);
  assert.equal(rows.find((r) => r.id === real.id).winner, null, 'rows are untouched');
  const patches = changedRows(rows, ms, real.id);
  assert.equal(patches[0].id, real.id, 'clicked match saves first');
  assert.deepEqual(patches[0].set, { winner: real.entry_b, status: 'done' });
  assert.equal(patches.length, 2);
  assert.equal(patches[1].entrantsChanged, true);
  assert.equal(patches.every((p) => p.updated_at === rows[0].updated_at), true);
});

test('changing an earlier result clears later ones, the third-place slot and stale poll counts', () => {
  let rows = rowsFor(['s1', 's2', 's3', 's4']);
  const play = (round, pos, pick, third = false) => {
    const ms = toMatches(rows);
    const m = at(ms, round, pos, third);
    setWinner(ms, m, pick === 'a' ? m.entry_a : m.entry_b);
    syncThirdPlace(ms);
    rows = apply(rows, changedRows(rows, ms, m.id));
  };
  play(1, 1, 'a'); // s1 beats s4
  play(1, 2, 'a'); // s2 beats s3
  play(2, 1, 'a'); // final: s1 beats s2
  play(2, 2, 'a', true); // third: s4 beats s3
  assert.deepEqual(bracketPlacements(toMatches(rows)).map((p) => p.entry), ['s1', 's2', 's4', 's3']);
  rows = rows.map((r) => (r.round === 2 && !r.is_third_place ? { ...r, votes_a: 10, votes_b: 4 } : r));

  // Overturn semifinal 1: s4 wins instead.
  const ms = toMatches(rows);
  const semi = at(ms, 1, 1);
  setWinner(ms, semi, 's4');
  syncThirdPlace(ms);
  const patches = changedRows(rows, ms, semi.id);
  rows = apply(rows, patches);
  const final = at(rows, 2, 1), third = at(rows, 2, 2, true);
  assert.equal(final.entry_a, 's4');
  assert.equal(final.winner, null);
  assert.equal(final.status, 'pending');
  assert.equal(final.votes_a, null, 'poll counts were for the old pairing');
  assert.equal(third.entry_a, 's1', 'semifinal loser moved into third place');
  assert.equal(third.winner, null);
  assert.equal(third.status, 'pending');
});

test('clearWinner takes the winner back out of later rounds', () => {
  let rows = rowsFor(['s1', 's2', 's3', 's4']);
  for (const pos of [1, 2]) {
    const ms = toMatches(rows); const m = at(ms, 1, pos);
    setWinner(ms, m, m.entry_a); syncThirdPlace(ms);
    rows = apply(rows, changedRows(rows, ms, m.id));
  }
  { const ms = toMatches(rows); const m = at(ms, 2, 1); setWinner(ms, m, 's1'); rows = apply(rows, changedRows(rows, ms, m.id)); }
  const ms = toMatches(rows);
  const semi = at(ms, 1, 1);
  clearWinner(ms, semi);
  const patches = changedRows(rows, ms, semi.id);
  rows = apply(rows, patches);
  assert.equal(at(rows, 1, 1).winner, null);
  assert.equal(at(rows, 1, 1).status, 'pending');
  assert.equal(at(rows, 2, 1).entry_a, null);
  assert.equal(at(rows, 2, 1).entry_b, 's2');
  assert.equal(at(rows, 2, 1).winner, null);
  assert.equal(at(rows, 2, 2, true).entry_a, null);
  assert.equal(at(rows, 2, 2, true).entry_b, 's3');
  // Clearing again changes nothing.
  const again = toMatches(rows);
  clearWinner(again, at(again, 1, 1));
  assert.deepEqual(changedRows(rows, again, at(again, 1, 1).id), []);
});

test('re-applying the same winner is idempotent (the route retries after a downstream conflict)', () => {
  const rows = rowsFor(['s1', 's2', 's3']);
  const ms = toMatches(rows);
  const m = ms.find((x) => x.round === 1 && x.entry_a && x.entry_b);
  setWinner(ms, m, m.entry_a);
  const once = apply(rows, changedRows(rows, ms, m.id));
  const ms2 = toMatches(once);
  setWinner(ms2, at(ms2, m.round, m.position), m.entry_a);
  syncThirdPlace(ms2);
  assert.deepEqual(changedRows(once, ms2, m.id), []);
});

test('secureShuffle is a permutation; secureRandomInt stays in range', () => {
  const items = Array.from({ length: 50 }, (_, i) => `e${i}`);
  const out = secureShuffle(items);
  assert.equal(out.length, 50);
  assert.deepEqual([...out].sort(), [...items].sort());
  for (let i = 0; i < 1000; i++) { const n = secureRandomInt(7); assert.ok(n >= 0 && n < 7 && Number.isInteger(n)); }
  // Deterministic with an injected source: always pick 0 → rotation pattern.
  assert.deepEqual(secureShuffle(['a', 'b', 'c'], () => 0), ['b', 'c', 'a']);
});

test('seedEntrants: registration order by created_at, de-duplicated; random keeps everyone', () => {
  const c = [
    { registration_id: 'late', created_at: '2026-09-03T00:00:00Z' },
    { registration_id: 'early', created_at: '2026-09-01T00:00:00Z' },
    { registration_id: 'mid', created_at: '2026-09-02T00:00:00Z' },
    { registration_id: 'mid', created_at: '2026-09-02T00:00:00Z' },
  ];
  assert.deepEqual(seedEntrants(c, 'registration'), ['early', 'mid', 'late']);
  assert.deepEqual(seedEntrants(c, 'random').sort(), ['early', 'late', 'mid']);
});

test('extraLiveMatches keeps the newest live match', () => {
  assert.deepEqual(extraLiveMatches([]), { keep: null, demote: [] });
  assert.deepEqual(
    extraLiveMatches([
      { id: 'x', updated_at: '2026-10-06T12:00:01.000000+00:00' },
      { id: 'y', updated_at: '2026-10-06T12:00:02.000000+00:00' },
    ]),
    { keep: 'y', demote: ['x'] },
  );
});

test('restrictedPublicName never shows a minor’s full legal name', () => {
  assert.equal(restrictedPublicName({ first_name: 'Sam', last_name: 'Rivera', nickname: 'Spinz' }), 'Spinz');
  assert.equal(restrictedPublicName({ first_name: 'Sam', last_name: 'Rivera', preferred_bracket_name: 'sam rivera' }), 'Sam R.');
  assert.equal(restrictedPublicName({ first_name: 'Sam', last_name: 'Rivera', preferred_bracket_name: 'Sammy' }), 'Sammy');
  assert.equal(restrictedPublicName({ first_name: 'Sam', last_name: '' }), 'Sam');
});

test('changedRows: a match whose entrants change loses its match score, like its poll counts', () => {
  const rows = rowsFor(['s1', 's2', 's3', 's4'], false);
  const semi1 = at(rows, 1, 1);
  const finalRow = at(rows, 2, 1);
  // Semifinal 1 is decided (s1 over s4), so the final has s1 in slot A with a running score entered.
  const decided = toMatches(rows);
  setWinner(decided, at(decided, 1, 1), 's1');
  const afterDecide = apply(rows, changedRows(rows, decided, semi1.id));
  const finalNow = at(afterDecide, 2, 1);
  assert.equal(finalNow.entry_a, 's1');
  finalNow.score_a = 2;
  finalNow.score_b = 1;
  // Taking the semifinal result back removes s1 from the final, so that score is about nobody now.
  const undo = toMatches(afterDecide);
  clearWinner(undo, at(undo, 1, 1));
  const patches = changedRows(afterDecide, undo, semi1.id);
  const finalPatch = patches.find((p) => p.id === finalRow.id);
  assert.ok(finalPatch, 'the final changes');
  assert.equal(finalPatch.set.entry_a, null);
  assert.equal(finalPatch.set.score_a, null);
  assert.equal(finalPatch.set.score_b, null);
});

test('toMatches carries match scores through', () => {
  const rows = rowsFor(['s1', 's2'], false).map((r) => ({ ...r, score_a: 2, score_b: 1 }));
  const [m] = toMatches(rows);
  assert.equal(m.score_a, 2);
  assert.equal(m.score_b, 1);
});
