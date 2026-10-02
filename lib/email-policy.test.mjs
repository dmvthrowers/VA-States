// Unit tests for the outbox rules (no Resend or DB calls).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetCap,
  classifyError,
  nextUtcMidnight,
  nextUtcMonth,
  parseDailyQuota,
  retryDelayMs,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PRIORITY_RESERVE,
} from './email-policy.ts';

const NOW = new Date('2026-10-02T15:30:00Z');

test('bulk email stops at the limit minus the reserve; urgent email uses the full limit', () => {
  assert.equal(budgetCap(2, DEFAULT_DAILY_LIMIT, DEFAULT_PRIORITY_RESERVE), 60);
  assert.equal(budgetCap(1, DEFAULT_DAILY_LIMIT, DEFAULT_PRIORITY_RESERVE), 90);
  assert.equal(budgetCap(0, DEFAULT_DAILY_LIMIT, DEFAULT_PRIORITY_RESERVE), 90);
  assert.equal(budgetCap(2, 20, 30), 0);
});

test('the default limit leaves a buffer under Resend\'s 100/day', () => {
  assert.ok(DEFAULT_DAILY_LIMIT < 100);
});

test('daily_quota_exceeded waits for the next UTC midnight', () => {
  const r = classifyError({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }, NOW);
  assert.equal(r.kind, 'quota');
  assert.equal(r.retryAt.toISOString(), '2026-10-03T00:00:00.000Z');
});

test('legacy rate_limit_exceeded with a quota message is still a quota wait', () => {
  assert.equal(classifyError({ name: 'rate_limit_exceeded', message: 'daily quota reached' }, NOW).kind, 'quota');
});

test('monthly_quota_exceeded waits for the 1st of next month', () => {
  const r = classifyError({ name: 'monthly_quota_exceeded', message: 'monthly' }, NOW);
  assert.equal(r.kind, 'quota');
  assert.equal(r.retryAt.toISOString(), '2026-11-01T00:00:00.000Z');
});

test('throttling, 5xx and network errors are retried', () => {
  assert.equal(classifyError({ name: 'rate_limit_exceeded', message: 'Too many requests' }).kind, 'retry');
  assert.equal(classifyError({ name: 'application_error', message: 'x' }).kind, 'retry');
  assert.equal(classifyError({ name: 'network_error', message: 'fetch failed' }).kind, 'retry');
  assert.equal(classifyError({ name: 'something_new', statusCode: 503 }).kind, 'retry');
});

test('validation errors are permanent', () => {
  assert.equal(classifyError({ name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 }).kind, 'failed');
});

test('backoff doubles and caps at an hour', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(retryDelayMs), [60_000, 120_000, 240_000, 480_000, 3_600_000]);
});

test('UTC boundaries', () => {
  assert.equal(nextUtcMidnight(new Date('2026-12-31T23:59:59Z')).toISOString(), '2027-01-01T00:00:00.000Z');
  assert.equal(nextUtcMonth(new Date('2026-12-15T00:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

test('quota header parsing', () => {
  assert.equal(parseDailyQuota('42'), 42);
  assert.equal(parseDailyQuota(null), null);
  assert.equal(parseDailyQuota('abc'), null);
  assert.equal(parseDailyQuota('-1'), null);
});
