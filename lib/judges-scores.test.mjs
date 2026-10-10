// Run: node --experimental-strip-types --test lib/judges-scores.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeSheets } from './judges-scores.ts';

const R = (registration_id, name, judge, score, extra = {}) =>
  ({ registration_id, division: '1A', round: 1, display_name: name, judge_name: judge, judge_user_id: null, final_score: score, ...extra });

test('one sheet per division and round, entries best first with each judge in a column', () => {
  const rows = [
    R('a', 'Ana', 'Zed', 80), R('a', 'Ana', 'Amy', 90),
    R('b', 'Bo', 'Zed', 95), R('b', 'Bo', 'Amy', 91),
    R('c', 'Cy', 'Amy', 70),
    R('x', 'Xi', 'Amy', 60, { division: 'X' }),
  ];
  const sheets = buildJudgeSheets(rows);
  assert.deepEqual(sheets.map((s) => [s.division, s.round]), [['1A', 1], ['X', 1]]);
  const s = sheets[0];
  assert.deepEqual(s.entries.map((e) => e.name), ['Bo', 'Ana', 'Cy']);
  assert.deepEqual(s.entries.map((e) => e.average), [93, 85, 70]);
  assert.deepEqual(s.entries[0].scores, [91, 95], 'columns follow the judges alphabetically (Amy, Zed)');
});

test('a judge who did not score someone leaves a null, and the average uses the scores that exist', () => {
  const s = buildJudgeSheets([R('a', 'Ana', 'Amy', 90), R('a', 'Ana', 'Zed', 70), R('c', 'Cy', 'Amy', 80)])[0];
  const cy = s.entries.find((e) => e.name === 'Cy');
  assert.deepEqual(cy.scores, [80, null]);
  assert.equal(cy.average, 80);
});

test('judges are Judge A, B, C unless names are turned on, and the letters are stable', () => {
  const rows = [R('a', 'Ana', 'Zed', 1), R('a', 'Ana', 'Amy', 2)];
  assert.deepEqual(buildJudgeSheets(rows)[0].judges, ['Judge A', 'Judge B']);
  assert.deepEqual(buildJudgeSheets([...rows].reverse())[0].judges, ['Judge A', 'Judge B']);
  assert.deepEqual(buildJudgeSheets(rows, () => ({ showNames: true }))[0].judges, ['Amy', 'Zed']);
});

test('lower-is-better divisions sort the other way, and ties fall back to the name', () => {
  const rows = [R('a', 'Ana', 'J', 12.5), R('b', 'Bo', 'J', 11), R('c', 'Cy', 'J', 11)];
  assert.deepEqual(buildJudgeSheets(rows, () => ({ better: 'lower' }))[0].entries.map((e) => e.name), ['Bo', 'Cy', 'Ana']);
  assert.deepEqual(buildJudgeSheets(rows)[0].entries.map((e) => e.name), ['Ana', 'Bo', 'Cy']);
});

test('rounds are separate sheets; scores arrive as strings; bad numbers are ignored; an empty input gives no sheets', () => {
  const rows = [R('a', 'Ana', 'J', '88.50'), R('a', 'Ana', 'J', 'x', { round: 2 }), R('a', 'Ana', 'K', 70, { round: 2 })];
  const sheets = buildJudgeSheets(rows);
  assert.deepEqual(sheets.map((s) => s.round), [1, 2]);
  assert.equal(sheets[0].entries[0].average, 88.5);
  assert.deepEqual(sheets[1].entries[0].scores, [null, 70]);
  assert.deepEqual(buildJudgeSheets([]), []);
});

test('judges keep their identity by id when two share a display name', () => {
  const rows = [R('a', 'Ana', 'Sam', 90, { judge_user_id: 'u1' }), R('a', 'Ana', 'Sam', 70, { judge_user_id: 'u2' })];
  const s = buildJudgeSheets(rows)[0];
  assert.equal(s.judges.length, 2);
  assert.deepEqual([...s.entries[0].scores].sort(), [70, 90]);
});
