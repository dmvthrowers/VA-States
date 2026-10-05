// Unit tests for the live schedule and side-event leaderboards.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, DIVISION_CODES } from '../contest.config.ts';
import {
  liveSchedule, nowAndNext, applyScheduleAction, scheduleIssues, sideLeaderboard, formatSideValue,
} from './schedule-core.ts';

// Contest day in UTC for simplicity: "10:00" → 10:00Z.
const at = (hhmm) => new Date(`2027-03-13T${hhmm}:00Z`);
const items = [
  { id: 'a', title: 'A', start: '10:00', minutes: 30, division: 'SBJ' },
  { id: 'b', title: 'B', start: '10:30', minutes: 30 },
  { id: 'c', title: 'C', start: '11:00', minutes: 30, division: 'X' },
  { id: 'awards', title: 'Awards', start: '12:00', minutes: 30, fixed: true },
];
const hhmm = (d) => d.toISOString().slice(11, 16);

test('a block that runs long pushes the rest back; fixed blocks stay put', () => {
  const states = [{ item_id: 'a', status: 'live', started_at: at('10:05').toISOString(), ended_at: null, published_at: null }];
  const live = liveSchedule(items, states, at('10:50'), at);
  assert.deepEqual(live.map((i) => [i.id, hhmm(i.est_start), hhmm(i.est_end), i.delay_minutes]), [
    ['a', '10:05', '10:50', 5], // live past its 30 minutes: runs until now
    ['b', '10:50', '11:20', 20],
    ['c', '11:20', '11:50', 20],
    ['awards', '12:00', '12:30', 0],
  ]);
  assert.deepEqual(nowAndNext(live).now.map((i) => i.id), ['a']);
  assert.equal(nowAndNext(live).next.id, 'b');
});

test('running early: later blocks wait for their planned time unless allowEarly', () => {
  const states = [{ item_id: 'a', status: 'done', started_at: at('10:00').toISOString(), ended_at: at('10:15').toISOString(), published_at: at('10:20').toISOString() }];
  assert.equal(hhmm(liveSchedule(items, states, at('10:16'), at)[1].est_start), '10:30');
  assert.equal(hhmm(liveSchedule(items, states, at('10:16'), at, true)[1].est_start), '10:16');
  assert.equal(liveSchedule(items, states, at('10:16'), at)[0].results_published, true);
});

test('an upcoming block is never estimated to start in the past', () => {
  const live = liveSchedule(items, [], at('10:40'), at);
  assert.equal(hhmm(live[0].est_start), '10:40');
  assert.equal(hhmm(live[1].est_start), '11:10');
});

test('actions: start → close judging → publish; unjudged blocks go start → done', () => {
  const now = at('10:00');
  let s = applyScheduleAction(items[0], undefined, 'start', now);
  assert.equal(s.status, 'live');
  assert.throws(() => applyScheduleAction(items[0], s, 'start', now), /already started/);
  s = applyScheduleAction(items[0], s, 'close_judging', at('10:31'));
  assert.deepEqual([s.status, s.ended_at], ['judging', at('10:31').toISOString()]);
  s = applyScheduleAction(items[0], s, 'publish', at('10:40'));
  assert.deepEqual([s.status, s.ended_at, s.published_at], ['done', at('10:31').toISOString(), at('10:40').toISOString()]);
  assert.throws(() => applyScheduleAction(items[1], undefined, 'close_judging', now), /isn't judged/);
  assert.throws(() => applyScheduleAction(items[1], undefined, 'publish', now), /no results/);
  assert.throws(() => applyScheduleAction(items[0], undefined, 'publish', now), /Close judging/);
  const b = applyScheduleAction(items[1], applyScheduleAction(items[1], undefined, 'start', now), 'done', at('10:20'));
  assert.equal(b.status, 'done');
  assert.equal(applyScheduleAction(items[0], s, 'reset', now).status, 'upcoming');
});

test('schedule config checks', () => {
  assert.deepEqual(scheduleIssues(dayOf.schedule, DIVISION_CODES, dayOf.sideEvents), []);
  const issues = scheduleIssues(
    [{ id: 'Bad Id', title: 'x', start: '25:00', minutes: 0, division: 'NOPE' }, { id: 'a', title: 'y', start: '10:00', minutes: 5, round: 2 }],
    DIVISION_CODES,
    [{ code: 'S', name: 's', description: '', kind: 'timer', better: 'higher', unit: 's', timeLimitSeconds: 60 }],
  ).join('\n');
  for (const re of [/id must be/, /HH:MM/, /minutes must be/, /unknown division "NOPE"/, /round needs a division/, /timeLimitSeconds is for counters/]) assert.match(issues, re);
});

test('side events: best try per person, ties share a place, hidden entries ignored', () => {
  const e = (id, name, value, t, extra = {}) => ({ id, name, value, created_at: `2027-03-13T10:0${t}:00Z`, ...extra });
  const board = sideLeaderboard([
    e('1', 'Sam R.', 12.4, 1), e('2', 'sam r.', 15.1, 2), e('3', 'Ari K.', 15.1, 3), e('4', 'Lee', 30, 4, { hidden: true }), e('5', 'Jo', 9, 5),
  ], 'higher');
  assert.deepEqual(board.map((r) => [r.place, r.name, r.best, r.tries]), [[1, 'Sam R.', 15.1, 2], [1, 'Ari K.', 15.1, 1], [3, 'Jo', 9, 1]]);
  assert.equal(sideLeaderboard([e('1', 'a', 5, 1), e('2', 'b', 3, 2)], 'lower')[0].name, 'b');
  assert.equal(formatSideValue(65.34, { kind: 'timer', unit: 'seconds' }), '1:05.3');
  assert.equal(formatSideValue(9.04, { kind: 'timer', unit: 'seconds' }), '9.0 s');
  assert.equal(formatSideValue(1204, { kind: 'counter', unit: 'loops' }), '1,204 loops');
});
