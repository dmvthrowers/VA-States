// Unit tests for the side-event stopwatch, tap counter and value checks.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStopwatch, stopwatchSeconds, parseManualTime, isValidSideValue, cleanSideName,
  counterInit, counterStep, secondsLeft,
} from './side-event-tools.ts';

test('formatStopwatch truncates to tenths and adds minutes', () => {
  assert.equal(formatStopwatch(0), '0.0');
  assert.equal(formatStopwatch(-50), '0.0');
  assert.equal(formatStopwatch(7399), '7.3');
  assert.equal(formatStopwatch(59999), '59.9');
  assert.equal(formatStopwatch(60000), '1:00.0');
  assert.equal(formatStopwatch(65340), '1:05.3');
  assert.equal(formatStopwatch(720000), '12:00.0');
});

test('stopwatchSeconds saves what the screen showed', () => {
  assert.equal(stopwatchSeconds(65399), 65.3);
  assert.equal(stopwatchSeconds(100), 0.1);
  assert.equal(stopwatchSeconds(99), 0);
});

test('parseManualTime accepts seconds and m:ss', () => {
  assert.equal(parseManualTime('65.3'), 65.3);
  assert.equal(parseManualTime(' 65 '), 65);
  assert.equal(parseManualTime('1:05.3'), 65.3);
  assert.equal(parseManualTime('1:05'), 65);
  assert.equal(parseManualTime('0:07.25'), 7.25);
  assert.equal(parseManualTime('2.5'), 2.5);
  for (const bad of ['', 'abc', '1:5', '1:75', '1.234', '-3', '1:05:00', '99999:00']) {
    assert.equal(parseManualTime(bad), null, bad);
  }
});

test('isValidSideValue: 0 ≤ v < 100000, at most 2 decimals', () => {
  for (const ok of [0, 1, 65.3, 1.15, 99999.99]) assert.ok(isValidSideValue(ok), String(ok));
  for (const bad of [-1, 100000, 1.234, NaN, Infinity, '5', null]) assert.ok(!isValidSideValue(bad), String(bad));
});

test('cleanSideName trims, collapses spaces and caps at 60', () => {
  assert.equal(cleanSideName('  Sam   K. '), 'Sam K.');
  assert.equal(cleanSideName('   '), null);
  assert.equal(cleanSideName('x'.repeat(60)), 'x'.repeat(60));
  assert.equal(cleanSideName('x'.repeat(61)), null);
  assert.equal(cleanSideName(5), null);
});

test('untimed counter counts every tap; undo and reset', () => {
  let s = counterInit();
  assert.equal(s.phase, 'open');
  for (let i = 0; i < 3; i++) s = counterStep(s, { type: 'tap', now: i });
  assert.equal(s.count, 3);
  s = counterStep(s, { type: 'undo' });
  assert.equal(s.count, 2);
  s = counterStep(counterStep(counterStep(s, { type: 'undo' }), { type: 'undo' }), { type: 'undo' });
  assert.equal(s.count, 0);
  s = counterStep(s, { type: 'start', now: 0 });
  assert.equal(s.phase, 'open', 'start does nothing without a time limit');
  s = counterStep(counterStep(s, { type: 'tap', now: 0 }), { type: 'reset' });
  assert.deepEqual(s, counterInit());
});

test('timed counter: taps count only while running, then TIME!', () => {
  const L = 60;
  let s = counterInit(L);
  assert.equal(s.phase, 'ready');
  s = counterStep(s, { type: 'tap', now: 0 }, L);
  assert.equal(s.count, 0, 'taps before start do not count');
  s = counterStep(s, { type: 'start', now: 1000 }, L);
  assert.equal(s.phase, 'running');
  assert.equal(s.endsAt, 61000);
  assert.equal(secondsLeft(s, 1000), 60);
  assert.equal(secondsLeft(s, 60500), 1);
  s = counterStep(s, { type: 'tap', now: 2000 }, L);
  s = counterStep(s, { type: 'tap', now: 60999 }, L);
  assert.equal(s.count, 2);
  s = counterStep(s, { type: 'tick', now: 30000 }, L);
  assert.equal(s.phase, 'running');
  s = counterStep(s, { type: 'tick', now: 61000 }, L);
  assert.equal(s.phase, 'done');
  assert.equal(secondsLeft(s, 61000), 0);
  s = counterStep(s, { type: 'tap', now: 61500 }, L);
  assert.equal(s.count, 2, 'taps after the buzzer do not count');
  s = counterStep(s, { type: 'undo' }, L);
  assert.equal(s.count, 1, 'undo still fixes a miscount after TIME!');
  s = counterStep(s, { type: 'start', now: 70000 }, L);
  assert.equal(s.phase, 'running');
  assert.equal(s.count, 0, 'a new round starts from zero');
});

test('a late tap ends a timed round even before the tick', () => {
  let s = counterStep(counterInit(10), { type: 'start', now: 0 }, 10);
  s = counterStep(s, { type: 'tap', now: 10000 }, 10);
  assert.equal(s.phase, 'done');
  assert.equal(s.count, 0);
});
