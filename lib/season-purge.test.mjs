// Season purge guards and shaping (build plan 4.4). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { championRows, purgeProblems, musicObjectsToDelete } from './season-purge.ts';

const now = new Date('2026-10-20T12:00:00Z');
const ok = { season: '2026', confirm: 'PURGE 2026', archiveStatus: 200, archiveBody: '<h1>VSYC-26 results 2026</h1>', backupAt: '2026-10-20T03:00:00Z', restoreTested: true, now };

test('all checks met: nothing blocks the purge', () => {
  assert.deepEqual(purgeProblems(ok), []);
});

test('each missing check is named', () => {
  assert.match(purgeProblems({ ...ok, confirm: null })[0], /PURGE 2026/);
  assert.match(purgeProblems({ ...ok, confirm: 'purge 2026' })[0], /confirm/);
  assert.match(purgeProblems({ ...ok, archiveStatus: 404 })[0], /not live \(status 404\)/);
  assert.match(purgeProblems({ ...ok, archiveStatus: null })[0], /unreachable/);
  assert.match(purgeProblems({ ...ok, archiveBody: 'nothing here' })[0], /does not mention 2026/);
  assert.match(purgeProblems({ ...ok, backupAt: null })[0], /last backup finished/);
  assert.match(purgeProblems({ ...ok, restoreTested: false })[0], /restore must have been tested/);
});

test('the backup must be recent, real and not from the future', () => {
  assert.match(purgeProblems({ ...ok, backupAt: '2026-10-19T11:00:00Z' })[0], /more than 24 hours/);
  assert.match(purgeProblems({ ...ok, backupAt: 'yesterday' })[0], /not a date/);
  assert.match(purgeProblems({ ...ok, backupAt: '2026-10-21T00:00:00Z' })[0], /future/);
  assert.deepEqual(purgeProblems({ ...ok, backupAt: '2026-10-19T12:30:00Z' }), []);
});

test('a bad season is refused and a wrong season in the confirmation does not match', () => {
  assert.ok(purgeProblems({ ...ok, season: '26', confirm: 'PURGE 26' }).some((p) => /--season/.test(p)));
  assert.ok(purgeProblems({ ...ok, confirm: 'PURGE 2025' }).some((p) => /confirm/.test(p)));
});

test('all problems are reported together', () => {
  assert.equal(purgeProblems({ ...ok, confirm: null, archiveStatus: 500, backupAt: null, restoreTested: false }).length, 4);
});

test('past champions: the podium with ties, plus any state champion off the podium', () => {
  const row = (place, name, extra = {}) => ({ place, name, city: null, state: 'VA', result: '90', ...extra });
  const data = { divisions: [
    { code: '1A', name: '1A', format: 'freestyle', rounds: [], final: [row(1, 'A'), row(2, 'B'), row(2, 'C'), row(4, 'D'), row(7, 'E', { champion: true })] },
    { code: 'X', name: 'X', format: 'freestyle', rounds: [], final: [] },
  ] };
  const out = championRows(data);
  assert.deepEqual(out.map((r) => [r.division, r.place, r.display_name, r.is_state_champion]),
    [['1A', 1, 'A', false], ['1A', 2, 'B', false], ['1A', 2, 'C', false], ['1A', 7, 'E', true]]);
  assert.equal(out[0].state, 'VA');
});

test('the lo-fi pool is spared', () => {
  assert.deepEqual(musicObjectsToDelete(['lofi/a.mp3', 'abc/1A.mp3', 'lofi/b.mp3', 'x.mp3']), ['abc/1A.mp3', 'x.mp3']);
});
