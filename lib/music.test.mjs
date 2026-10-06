// Unit tests for music slots: one track per division per slot (routine, each round, extras such as
// battle music), replace rules, cleanup, reminders and lo-fi fallback. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMusicFilename } from './filename.ts';
import {
  playerSlots, buildSlots, slotStatus, slotTitle, needsReplaceConfirm, staleObjectToRemove, emptySlots,
  joinDivisions, lofiPool, lofiDisplayName, emptySlotsByPlayer, planFallbacks,
} from './music.ts';
import { musicSlotsOf, playSlotFor, hasMusic, roundKey, configIssues } from './divisions-core.ts';
import { competition } from '../contest.config.ts';

const one = [{ key: 'main', label: 'Routine music' }];
const rounds = [{ key: 'prelims', label: 'Prelims' }, { key: 'final', label: 'Final' }];
const battle = [{ key: 'battle', label: 'Battle music' }];
// 1A and X have prelims + final music, BATTLE has battle music only, SBJ has one track, NOMUSIC none.
const slotsOf = (code) => ({ '1A': rounds, X: rounds, SBJ: one, BATTLE: battle }[code] ?? []);
const nameOf = (c) => ({ '1A': '1A — Single String', X: 'X Division', SBJ: 'Sport', BATTLE: 'Battle' }[c] ?? c);
const track = (division, slot = 'main', extra = {}) => ({
  division, slot, object_name: `${division}_${slot}_Baus_Bryant.mp3`, filename: `${division}_${slot}_Baus_Bryant.mp3`,
  source: 'player', is_fallback: false, uploaded_at: '2026-09-01T00:00:00Z', ...extra,
});

test('files: each division and slot gets its own name, so uploads never overwrite each other', () => {
  const name = (div, slot) => buildMusicFilename(div, 'Baus', 'Bryant', 'song.mp3', slot).filename;
  assert.equal(name('1A'), '1A_Baus_Bryant.mp3');                 // the single routine track keeps the old name
  assert.equal(name('1A', 'main'), '1A_Baus_Bryant.mp3');
  assert.equal(name('1A', 'prelims'), '1A_PRELIMS_Baus_Bryant.mp3');
  assert.equal(name('1A', 'final'), '1A_FINAL_Baus_Bryant.mp3');
  assert.equal(name('X', 'prelims'), 'X_PRELIMS_Baus_Bryant.mp3');
  assert.equal(name('BATTLE', 'battle'), 'BATTLE_BATTLE_Baus_Bryant.mp3');
  assert.equal(new Set(['1A', 'X'].flatMap((d) => ['prelims', 'final'].map((s) => name(d, s)))).size, 4);
  assert.match(buildMusicFilename('1A', 'Baus', 'Bryant', 'song.ogg', 'final').error, /must be \.mp3/);
});

test('a 1A + X player has a prelims and a final slot in each division (4), in entry order', () => {
  const slots = playerSlots(['X', '1A'], slotsOf);
  assert.deepEqual(slots.map((s) => `${s.division}:${s.slot}`), ['X:prelims', 'X:final', '1A:prelims', '1A:final']);
  assert.ok(slots.every((s) => s.labelled));
});

test('divisions without music, repeats and unknown divisions add no slots', () => {
  assert.deepEqual(playerSlots(['NOMUSIC', '1A', '1A'], slotsOf).map((s) => s.division), ['1A', '1A']);
  assert.deepEqual(playerSlots([], slotsOf), []);
});

test('a battle division adds battle music next to routine music', () => {
  const slots = playerSlots(['SBJ', 'BATTLE'], slotsOf);
  assert.deepEqual(slots.map((s) => `${s.division}:${s.slot}`), ['SBJ:main', 'BATTLE:battle']);
  assert.deepEqual(slots.map((s) => s.labelled), [false, false]); // one track each: no label needed
});

test('buildSlots: status per slot, so prelims can be done while the final is still empty', () => {
  const slots = buildSlots(['1A', 'X'], [track('1A', 'prelims'), track('X', 'prelims'), track('X', 'final')], slotsOf, nameOf);
  assert.deepEqual(slots.map((s) => `${s.division}:${s.slot}:${s.status}`), [
    '1A:prelims:uploaded', '1A:final:empty', 'X:prelims:uploaded', 'X:final:uploaded',
  ]);
  assert.deepEqual(emptySlots(slots).map((s) => `${s.division}:${s.slot}`), ['1A:final']);
});

test('slotTitle: the track label only shows when a division has several tracks', () => {
  const s = buildSlots(['1A', 'SBJ'], [], slotsOf, nameOf);
  assert.equal(slotTitle(s[0]), '1A — Single String · Prelims');
  assert.equal(slotTitle(s[2]), 'Sport');
});

test('a track for a slot the division does not have is ignored', () => {
  const slots = buildSlots(['SBJ'], [track('SBJ', 'prelims')], slotsOf, nameOf);
  assert.deepEqual(slots.map((s) => [s.slot, s.status]), [['main', 'empty']]);
});

test('lo-fi fallback shows as fallback, not uploaded', () => {
  const fb = track('1A', 'final', { source: 'fallback', is_fallback: true, object_name: 'lofi/rain.mp3', filename: 'LO-FI rain' });
  const slots = buildSlots(['1A'], [track('1A', 'prelims'), fb], slotsOf, nameOf);
  assert.deepEqual(slots.map((s) => s.status), ['uploaded', 'fallback']);
  assert.equal(slotStatus(undefined), 'empty');
});

test('replacing a real track needs confirmation; an empty slot or a fallback does not', () => {
  assert.equal(needsReplaceConfirm(track('1A')), true);
  assert.equal(needsReplaceConfirm(null), false);
  assert.equal(needsReplaceConfirm(track('1A', 'main', { is_fallback: true })), false);
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
  assert.equal(lofiDisplayName('lofi/rain_drops-01.mp3'), 'LO-FI rain drops 01');
});

test('emptySlotsByPlayer finds only slots with nothing, per division and slot', () => {
  const players = [
    { id: 'a', divisions: ['1A', 'X'] },   // 1A prelims done; the rest empty
    { id: 'b', divisions: ['SBJ'] },       // empty
    { id: 'c', divisions: ['SBJ'] },       // done
    { id: 'd', divisions: ['NOMUSIC'] },   // nothing to upload
  ];
  const tracks = [
    { registration_id: 'a', division: '1A', slot: 'prelims' },
    { registration_id: 'c', division: 'SBJ', slot: 'main' },
  ];
  const r = emptySlotsByPlayer(players, tracks, slotsOf);
  assert.deepEqual(r.map((p) => [p.id, p.slots.map((s) => `${s.division}:${s.slot}`)]), [
    ['a', ['1A:final', 'X:prelims', 'X:final']],
    ['b', ['SBJ:main']],
  ]);
});

test('a lo-fi slot counts as filled, so reminders stop and a second run assigns nothing', () => {
  const tracks = [{ registration_id: 'a', division: 'SBJ', slot: 'main' }];
  assert.deepEqual(emptySlotsByPlayer([{ id: 'a', divisions: ['SBJ'] }], tracks, slotsOf), []);
});

test('planFallbacks: one track per empty slot, spread across a small pool', () => {
  const empty = emptySlotsByPlayer([{ id: 'a', divisions: ['1A'] }, { id: 'b', divisions: ['SBJ'] }], [], slotsOf);
  const pool = ['lofi/one.mp3', 'lofi/two.mp3'];
  const plan = planFallbacks(empty, pool, () => 0.5);
  assert.deepEqual(plan.map((p) => `${p.registration_id}:${p.division}:${p.slot}`), ['a:1A:prelims', 'a:1A:final', 'b:SBJ:main']);
  for (const p of plan) assert.ok(pool.includes(p.object_name));
  assert.notEqual(plan[0].object_name, plan[1].object_name);
  assert.deepEqual(planFallbacks(empty, []), []);
});

// ---- config: which slots a division has

const base = { name: 'X', description: '', priceCents: 0, scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: null } };
const R = [{ name: 'Prelims', advance: 10 }, { name: 'Semi-final', advance: 5 }, { name: 'Final' }];

test('music: true is one routine track (how VSYC-26 works today)', () => {
  const d = { ...base, code: 'A', music: true };
  assert.deepEqual(musicSlotsOf(d), [{ key: 'main', label: 'Routine music' }]);
  assert.equal(playSlotFor(d, 1), 'main');
  assert.equal(hasMusic(d), true);
  assert.deepEqual(['1A', 'X', 'SBJ'].map((c) => hasMusic(competition.divisions.find((x) => x.code === c))), [true, true, true]);
});

test('music: false is no tracks', () => {
  const d = { ...base, code: 'A', music: false };
  assert.deepEqual(musicSlotsOf(d), []);
  assert.equal(playSlotFor(d), null);
  assert.equal(hasMusic(d), false);
});

test('perRound: a track for prelims, semi-final and final, and the DJ plays the right one', () => {
  const d = { ...base, code: 'A', music: { perRound: true }, rounds: R };
  assert.deepEqual(musicSlotsOf(d).map((s) => [s.key, s.label]), [['prelims', 'Prelims'], ['semi-final', 'Semi-final'], ['final', 'Final']]);
  assert.deepEqual([1, 2, 3].map((r) => playSlotFor(d, r)), ['prelims', 'semi-final', 'final']);
  assert.equal(playSlotFor(d, 4), null);
  assert.deepEqual(configIssues({ ...competition, divisions: [d], combos: [] }), []);
});

test('a round can name its own key', () => {
  assert.equal(roundKey({ name: 'Round of 16', key: 'r16' }), 'r16');
  assert.equal(roundKey({ name: 'Semi-final' }), 'semi-final');
  assert.equal(roundKey({ name: '???' }, 2), 'round-3');
});

test('extra tracks: battle music next to routine music, or on its own', () => {
  const both = { ...base, code: 'A', music: { extra: [{ key: 'battle', label: 'Battle music' }] } };
  assert.deepEqual(musicSlotsOf(both).map((s) => s.key), ['main', 'battle']);
  assert.equal(playSlotFor(both, 1), 'main');
  const only = { ...base, code: 'B', music: { routine: false, extra: [{ key: 'battle', label: 'Battle music' }] } };
  assert.deepEqual(musicSlotsOf(only).map((s) => s.key), ['battle']);
  assert.equal(playSlotFor(only, 1), 'battle');
  assert.deepEqual(configIssues({ ...competition, divisions: [both, only], combos: [] }), []);
});

test('music config mistakes are caught', () => {
  const issues = (music, rest = {}) => configIssues({ ...competition, divisions: [{ ...base, code: 'A', music, ...rest }], combos: [] }).join(' | ');
  assert.match(issues({ routine: false }), /nothing to upload/);
  assert.match(issues({ perRound: true }), /needs the division to have rounds/);
  assert.match(issues({ extra: [{ key: 'main', label: 'x' }] }), /reserved/);
  assert.match(issues({ extra: [{ key: 'Bad Key', label: 'x' }] }), /must be lowercase/);
  assert.match(issues({ extra: [{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }] }), /share the key/);
  assert.match(issues({ perRound: true }, { rounds: [{ name: 'Round', advance: 4 }, { name: 'Round' }] }), /share the key "round"/);
});
