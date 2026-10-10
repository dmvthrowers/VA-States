// First admin, once (master plan E9). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFirstAdminArgs, firstAdminDecision } from './first-admin.ts';

test('arguments', () => {
  const ok = parseFirstAdminArgs(['--email', ' You@Example.org ', '--name', 'Sam Rivera']);
  assert.deepEqual(ok, { ok: true, args: { email: 'you@example.org', name: 'Sam Rivera', dryRun: false } });
  assert.equal(parseFirstAdminArgs(['--email', 'a@b.co', '--name', 'A', '--dry-run']).args.dryRun, true);
});

test('bad or missing arguments say what to pass', () => {
  assert.match(parseFirstAdminArgs([]).error, /--email/);
  assert.match(parseFirstAdminArgs(['--email', 'nope', '--name', 'A']).error, /--email/);
  assert.match(parseFirstAdminArgs(['--email', 'a@b.co']).error, /--name/);
  assert.match(parseFirstAdminArgs(['--email', 'a@b.co', '--name', 'x'.repeat(81)]).error, /--name/);
});

test('allowed only when there is no admin anywhere', () => {
  assert.deepEqual(firstAdminDecision({ activeAdminAccounts: 0, activeAdminGrants: 0 }), { allowed: true });
  assert.equal(firstAdminDecision({ activeAdminAccounts: 1, activeAdminGrants: 0 }).allowed, false);
  assert.equal(firstAdminDecision({ activeAdminAccounts: 0, activeAdminGrants: 2 }).allowed, false);
  assert.match(firstAdminDecision({ activeAdminAccounts: 1, activeAdminGrants: 1 }).reason, /already exists/);
});
