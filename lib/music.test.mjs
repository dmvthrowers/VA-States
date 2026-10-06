// Unit tests for per-division music: the two-division case from VSYC-26, replace rules and cleanup.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMusicFilename } from './filename.ts';
import {
  musicDivisions, buildSlots, slotStatus, needsReplaceConfirm, staleObjectToRemove, emptyDivisions, joinDivisions,
  lofiPool, lofiDisplayName, emptySlotsByPlayer, planFallbacks,
} from './music.ts';

const hasMusic = (c) => c !== 'NOMUSIC';
const nameOf = (c) => ({ '1A': '1A — Single String', X: 'X Division', SBJ: 'Sport / Beginner / Junior' }[c] ?? c);
const track = (division, extra = {}) => ({
  division, object_name: `${division}_Baus_Bryant.mp3`, filename: `${division}_Baus_Bryant.mp3`,
  source: 'player', is_fallback: false, uploaded_at: '2026-09-01T00:00:00Z', ...extra,
});

test('a 1A + X player gets two separate files, so one upload cannot overwrite the other', () => {
  const a = buildMusicFilename('1A', 'Baus', 'Bryant', 'song.mp3').filename;
  const x = buildMusicFilename('X', 'Baus', 'Bryant', 'other.mp3').filename;
  assert.equal(a, '1A_Baus_Bryant.mp3');
  assert.equal(x, 'X_Baus_Bryant.mp3');
  assert.notEqual(a, x);
});

test('musicDivisions keeps entry order, drops duplicates and divisions without music', () => {
  assert.deepEqual(musicDivisions(['X', '1A'], hasMusic), ['X', '1A']);
  assert.deepEqual(musicDivisions(['1A', '1A', 'NOMUSIC', 'X'], hasMusic), ['1A', 'X']);
  assert.deepEqual(musicDivisions([], hasMusic), []);
});

test('buildSlots: one slot per division with its own status', () => {
  const slots = buildSlots(['1A', 'X'], [track('1A')], hasMusic, nameOf);
  assert.equal(slots.length, 2);
  assert.deepEqual(slots.map((s) => [s.division, s.status]), [['1A', 'uploaded'], ['X', 'empty']]);
  assert.equal(slots[0].track.filename, '1A_Baus_Bryant.mp3');
  assert.equal(slots[1].track, null);
  assert.equal(slots[1].name, 'X Division');
});

test('buildSlots: a lo-fi fallback shows as fallback, not uploaded', () => {
  const fb = track('X', { source: 'fallback', is_fallback: true, object_name: 'lofi/rain.mp3', filename: 'LO-FI rain' });
  const slots = buildSlots(['1A', 'X'], [track('1A'), fb], hasMusic, nameOf);
  assert.deepEqual(slots.map((s) => s.status), ['uploaded', 'fallback']);
  assert.deepEqual(emptyDivisions(slots), []);
  assert.deepEqual(emptyDivisions(buildSlots(['1A', 'X'], [track('1A')], hasMusic, nameOf)), ['X']);
});

test('tracks for a division the player did not enter are ignored', () => {
  const slots = buildSlots(['1A'], [track('SBJ')], hasMusic, nameOf);
  assert.deepEqual(slots.map((s) => [s.division, s.status]), [['1A', 'empty']]);
});

test('replacing a real track needs confirmation; an empty slot or a fallback does not', () => {
  assert.equal(needsReplaceConfirm(track('1A')), true);
  assert.equal(needsReplaceConfirm(null), false);
  assert.equal(needsReplaceConfirm(track('1A', { is_fallback: true })), false);
  assert.equal(slotStatus(undefined), 'empty');
});

test('staleObjectToRemove: only a different, unshared, non lo-fi file', () => {
  assert.equal(staleObjectToRemove('1A_Baus_Bryant.wav', '1A_Baus_Bryant.mp3', 0), '1A_Baus_Bryant.wav');
  assert.equal(staleObjectToRemove('1A_Baus_Bryant.mp3', '1A_Baus_Bryant.mp3', 0), null);
  assert.equal(staleObjectToRemove('lofi/rain.mp3', '1A_Baus_Bryant.mp3', 0), null);
  assert.equal(staleObjectToRemove('shared.mp3', '1A_Baus_Bryant.mp3', 1), null);
  assert.equal(staleObjectToRemove(null, '1A_Baus_Bryant.mp3', 0), null);
});

test('joinDivisions reads naturally', () => {
  assert.equal(joinDivisions(['1A']), '1A');
  assert.equal(joinDivisions(['1A', 'X']), '1A and X');
  assert.equal(joinDivisions(['1A', 'X', 'SBJ']), '1A, X and SBJ');
});

test('lofiPool keeps audio files under lofi/ and skips placeholders', () => {
  assert.deepEqual(
    lofiPool(['rain.mp3', 'Cafe.WAV', '.emptyFolderPlaceholder', 'notes.txt', 'late_night.m4a']),
    ['lofi/rain.mp3', 'lofi/Cafe.WAV', 'lofi/late_night.m4a'],
  );
  assert.deepEqual(lofiPool([]), []);
});

test('lofiDisplayName is readable', () => {
  assert.equal(lofiDisplayName('lofi/rain_drops-01.mp3'), 'LO-FI rain drops 01');
});

test('emptySlotsByPlayer finds only slots with nothing, per division', () => {
  const players = [
    { id: 'a', divisions: ['1A', 'X'] },   // 1A done, X empty
    { id: 'b', divisions: ['SBJ'] },       // empty
    { id: 'c', divisions: ['1A'] },        // done
    { id: 'd', divisions: ['X', 'NOMUSIC'] }, // X empty; NOMUSIC ignored
  ];
  const tracks = [
    { registration_id: 'a', division: '1A' },
    { registration_id: 'c', division: '1A' },
  ];
  assert.deepEqual(emptySlotsByPlayer(players, tracks, hasMusic), [
    { id: 'a', divisions: ['X'] },
    { id: 'b', divisions: ['SBJ'] },
    { id: 'd', divisions: ['X'] },
  ]);
});

test('a lo-fi slot counts as filled, so reminders stop and a second run assigns nothing', () => {
  const players = [{ id: 'a', divisions: ['1A', 'X'] }];
  const tracks = [{ registration_id: 'a', division: '1A' }, { registration_id: 'a', division: 'X' }];
  assert.deepEqual(emptySlotsByPlayer(players, tracks, hasMusic), []);
});

test('planFallbacks: one track per empty slot, spread across a small pool', () => {
  const empty = [{ id: 'a', divisions: ['1A', 'X'] }, { id: 'b', divisions: ['SBJ'] }, { id: 'c', divisions: ['1A'] }];
  const pool = ['lofi/one.mp3', 'lofi/two.mp3'];
  const plan = planFallbacks(empty, pool, () => 0.5);
  assert.equal(plan.length, 4);
  assert.deepEqual(plan.map((p) => `${p.registration_id}:${p.division}`), ['a:1A', 'a:X', 'b:SBJ', 'c:1A']);
  for (const p of plan) assert.ok(pool.includes(p.object_name));
  // two slots in a row never get the same track while the pool has more than one
  assert.notEqual(plan[0].object_name, plan[1].object_name);
  assert.notEqual(plan[2].object_name, plan[3].object_name);
});

test('planFallbacks with an empty pool assigns nothing', () => {
  assert.deepEqual(planFallbacks([{ id: 'a', divisions: ['1A'] }], []), []);
});
