// Code of conduct versions (master plan P1). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conductStatus, summarizeConduct } from './conduct-version.ts';

test('status', () => {
  assert.equal(conductStatus('2', '2'), 'current');
  assert.equal(conductStatus('1', '2'), 'outdated');
  assert.equal(conductStatus(null, '2'), 'unrecorded');
  assert.equal(conductStatus(undefined, '2'), 'unrecorded');
  assert.equal(conductStatus('', '2'), 'unrecorded');
});

test('summary counts each state and each version', () => {
  const s = summarizeConduct(['1', '1', '2', null, '2', '2'], '2');
  assert.deepEqual({ current: s.current, outdated: s.outdated, unrecorded: s.unrecorded, total: s.total }, { current: 3, outdated: 2, unrecorded: 1, total: 6 });
  assert.deepEqual(s.byVersion, { '1': 2, '2': 3 });
});

test('an empty list summarizes to zeros', () => {
  assert.deepEqual(summarizeConduct([], '1'), { current: 0, outdated: 0, unrecorded: 0, total: 0, byVersion: {} });
});
