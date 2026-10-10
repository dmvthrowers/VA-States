// Email stub (master plan E8). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, stubLine, providerConfigured, STUB_RECHECK_MS } from './email-stub.ts';

test('addresses are masked in logs', () => {
  assert.equal(maskEmail('jane.doe@example.org'), 'j***@example.org');
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail('nonsense'), '***');
  assert.equal(maskEmail('@x.org'), '***');
});

test('the stub line names the subject and a masked recipient, never the whole address', () => {
  const line = stubLine('Your registration\n is confirmed', 'jane.doe@example.org');
  assert.match(line, /\[email stub\]/);
  assert.match(line, /"Your registration is confirmed"/);
  assert.ok(!line.includes('jane.doe'));
  assert.match(line, /RESEND_API_KEY/);
});

test('long subjects are cut', () => {
  assert.ok(stubLine('x'.repeat(500), 'a@b.co').length < 300);
});

test('provider detection ignores blank keys', () => {
  assert.equal(providerConfigured({}), false);
  assert.equal(providerConfigured({ RESEND_API_KEY: '' }), false);
  assert.equal(providerConfigured({ RESEND_API_KEY: '   ' }), false);
  assert.equal(providerConfigured({ RESEND_API_KEY: 're_123' }), true);
});

test('recheck is an hour', () => {
  assert.equal(STUB_RECHECK_MS, 3600000);
});
