// Schedule conflict check (master plan D6): overlaps and tight turnarounds between division blocks. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictSentence, scheduleConflicts, toMinutes } from './schedule-conflicts.ts';

const blocks = [
  { id: 'doors', title: 'Doors', start: '09:30', minutes: 30 },
  { id: 'sbj', title: 'Sport / Beginner / Junior', start: '10:00', minutes: 45, division: 'SBJ' },
  { id: 'x', title: 'X Division', start: '10:45', minutes: 45, division: 'X' },
  { id: '1a', title: '1A', start: '10:30', minutes: 75, division: '1A' },
];
const players = [
  { id: 'p1', name: 'Ada', divisions: ['SBJ', '1A'] },
  { id: 'p2', name: 'Bo', divisions: ['SBJ'] },
  { id: 'p3', name: 'Cy', divisions: ['X', '1A', 'SBJ'] },
];

test('times parse as minutes since midnight, and junk is not a number', () => {
  assert.equal(toMinutes('10:30'), 630);
  assert.equal(toMinutes('9:05'), 545);
  assert.ok(Number.isNaN(toMinutes('soon')));
});

test('overlapping blocks with a shared player are reported, with the minutes and the players', () => {
  const c = scheduleConflicts(blocks, players);
  const sbj1a = c.find((x) => [x.a.id, x.b.id].sort().join() === '1a,sbj');
  assert.ok(sbj1a);
  assert.equal(sbj1a.kind, 'overlap');
  assert.equal(sbj1a.minutes, 15);
  assert.deepEqual(sbj1a.players.map((p) => p.name).sort(), ['Ada', 'Cy']);
  const x1a = c.find((x) => [x.a.id, x.b.id].sort().join() === '1a,x');
  assert.equal(x1a.minutes, 45); // X (10:45-11:30) sits inside 1A (10:30-11:45)
  assert.deepEqual(x1a.players.map((p) => p.name), ['Cy']);
});

test('blocks with nobody in both divisions are left out, and non-division blocks are ignored', () => {
  const c = scheduleConflicts(blocks, [{ id: 'p2', name: 'Bo', divisions: ['SBJ'] }]);
  assert.deepEqual(c, []);
});

test('back to back blocks only warn when a gap is asked for', () => {
  // SBJ ends 10:45 exactly when X starts.
  const sbjX = (gap) => scheduleConflicts(blocks, players, gap).find((x) => [x.a.id, x.b.id].sort().join() === 'sbj,x');
  assert.equal(sbjX(0), undefined);
  const tight = sbjX(10);
  assert.equal(tight.kind, 'tight');
  assert.equal(tight.minutes, 0);
});

test('overlaps come before tight turnarounds, longest overlap first', () => {
  const c = scheduleConflicts(blocks, players, 10);
  const kinds = c.map((x) => x.kind);
  assert.ok(kinds.indexOf('tight') > kinds.lastIndexOf('overlap'));
  const overlaps = c.filter((x) => x.kind === 'overlap').map((x) => x.minutes);
  assert.deepEqual(overlaps, [...overlaps].sort((a, b) => b - a));
});

test('two blocks of the same division, and bad times, never conflict', () => {
  const rounds = [
    { id: 'a', title: 'Prelims', start: '10:00', minutes: 60, division: 'X' },
    { id: 'b', title: 'Finals', start: '10:30', minutes: 60, division: 'X' },
    { id: 'c', title: 'Broken', start: 'tba', minutes: 30, division: 'SBJ' },
  ];
  assert.deepEqual(scheduleConflicts(rounds, players), []);
});

test('sentences read plainly for one player and for several', () => {
  const c = scheduleConflicts(blocks, players);
  const one = c.find((x) => x.players.length === 1);
  assert.match(conflictSentence(one), /overlap by \d+ min\. \w+ is in both\./);
  const many = c.find((x) => x.players.length > 1);
  assert.match(conflictSentence(many), /\d+ players are in both\./);
});
