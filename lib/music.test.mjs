// Unit tests for per-division music: the two-division case from VSYC-26, replace rules and cleanup.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMusicFilename } from './filename.ts';
import {
  musicDivisions, buildSlots, slotStatus, needsReplaceConfirm, staleObjectToRemove, emptyDivisions, joinDivisions,
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
