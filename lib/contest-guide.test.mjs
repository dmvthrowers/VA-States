// Contest guide page (master plan T18, O1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockLabel, instantLabel, deadlineLabels, routineLabel } from './contest-guide.ts';

test('clock labels', () => {
  assert.equal(clockLabel('09:30'), '9:30 AM');
  assert.equal(clockLabel('12:00'), '12:00 PM');
  assert.equal(clockLabel('00:15'), '12:15 AM');
  assert.equal(clockLabel('13:05'), '1:05 PM');
});

test('an instant reads in the zone asked for', () => {
  const iso = '2027-03-11T23:59:59-06:00';
  assert.match(instantLabel(iso, 'America/Chicago'), /March 11, 2027.*11:59 PM/);
  assert.match(instantLabel(iso, 'America/Los_Angeles'), /March 11, 2027.*9:59 PM/);
  assert.equal(instantLabel('not a date', 'America/Chicago'), '');
});

test('reader label appears only when it differs from the venue', () => {
  const iso = '2027-03-11T23:59:59-06:00';
  assert.equal(deadlineLabels(iso, 'America/Chicago', 'America/Chicago').reader, null);
  assert.equal(deadlineLabels(iso, 'America/Chicago', null).reader, null);
  assert.match(deadlineLabels(iso, 'America/Chicago', 'America/New_York').reader, /March 12, 2027.*12:59 AM/);
  assert.equal(deadlineLabels(iso, 'America/Chicago', 'Not/AZone').reader, null);
});

test('routine labels', () => {
  assert.equal(routineLabel(90), '1:30');
  assert.equal(routineLabel(180), '3:00');
  assert.equal(routineLabel(null), null);
});
