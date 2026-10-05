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
