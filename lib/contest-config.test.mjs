// VSYC-26 contest.config.ts sanity checks: the division block and the day-of schedule are
// valid, and the divisions match what production stores in vsyc_divisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competition, dayOf, contest } from '../contest.config.ts';
import { configIssues } from './divisions-core.ts';
import { scheduleIssues } from './schedule-core.ts';

test('the VSYC-26 divisions are valid', () => {
  assert.deepEqual(configIssues(competition), []);
});

test('the day-of schedule and side events are valid', () => {
  assert.deepEqual(scheduleIssues(dayOf.schedule, competition.divisions.map((d) => d.code), dayOf.sideEvents), []);
});

test('divisions match production (1A, X with 2A–5A styles, SBJ)', () => {
  assert.deepEqual(competition.divisions.map((d) => d.code), ['1A', 'X', 'SBJ']);
  const x = competition.divisions.find((d) => d.code === 'X');
  assert.deepEqual(x.styles.options.map((s) => [s.code, s.multiplier]), [['2A', 1.4], ['3A', 1.5], ['4A', 1.3], ['5A', 1.6]]);
  const sbj = competition.divisions.find((d) => d.code === 'SBJ');
  assert.deepEqual(sbj.scoring, { format: 'freestyle', techCap: 20, evalCap: 20, negativeClicks: false, deductions: null });
});

test('contest facts are VSYC-26', () => {
  assert.equal(contest.date, '2026-09-19');
  assert.equal(contest.timeZone, 'America/New_York');
  assert.equal(contest.venue.name, 'Dulles Town Center');
});

test('VA State Champion is on', () => {
  assert.deepEqual(contest.stateChampion, { state: 'VA', title: 'VA State Champion' });
});

test('VSYC entry rules: SBJ alone, X needs 1–2 styles, 1A + X allows one X style', async () => {
  const { selectionIssues } = await import('./divisions-core.ts');
  const ok = (divs, styles = {}) => selectionIssues(divs, styles, competition).length === 0;
  assert.ok(ok(['1A']));
  assert.ok(ok(['SBJ']));
  assert.ok(!ok(['SBJ', '1A']), 'SBJ cannot combine with 1A');
  assert.ok(!ok(['X']), 'X needs a style');
  assert.ok(ok(['X'], { X: ['2A', '5A'] }));
  assert.ok(!ok(['X'], { X: ['2A', '3A', '4A'] }), 'at most two X styles');
  assert.ok(ok(['1A', 'X'], { X: ['3A'] }));
  assert.ok(!ok(['1A', 'X'], { X: ['3A', '4A'] }), '1A + two X styles is three styles');
});

test('styleCap: X allows two styles alone, one next to 1A', async () => {
  const { styleCap } = await import('./divisions-core.ts');
  assert.equal(styleCap('X', ['X'], {}, competition), 2);
  assert.equal(styleCap('X', ['1A', 'X'], {}, competition), 1);
  assert.equal(styleCap('1A', ['1A', 'X'], {}, competition), 0, '1A has no styles');
});
