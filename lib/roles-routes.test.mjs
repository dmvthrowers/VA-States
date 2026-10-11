// Step 4, second batch: the remaining /api/admin routes check capabilities. Each of them used to be admin-only,
// so for the four roles that exist today (admin, judge, dj, audio_tech) only admin may get through, exactly as
// before. Accounts with other grants get what their roles allow. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, canAny, grantsFromLegacyRole, holdsAnyRole } from './roles.ts';

const legacy = ['admin', 'judge', 'dj', 'audio_tech'];

test('formerly admin-only routes still admit only admin among the existing roles', () => {
  const caps = [
    'event.configure', // bracket draw, round advancement
    'registrations.edit', // comp codes, mark paid / music, music status, reminders and fallback, toggle code, walk-up
    'players.view_private', // CSV export and the survey lists
    'staff.manage', // creating staff accounts
  ];
  for (const cap of caps) {
    for (const role of legacy) {
      assert.equal(can(grantsFromLegacyRole(role), cap), role === 'admin', `${cap} for ${role}`);
    }
  }
});

test('the new roles reach only what fits them', () => {
  const g = (role) => [{ role }];
  // organizer runs registration and sees private data, but doesn't change the event or staff
  assert.ok(can(g('organizer'), 'registrations.edit') && can(g('organizer'), 'players.view_private'));
  assert.ok(!can(g('organizer'), 'event.configure') && !can(g('organizer'), 'staff.manage'));
  // finance reads registrations but can't edit them or see private details
  assert.ok(!canAny(g('finance'), ['registrations.edit', 'players.view_private', 'event.configure', 'staff.manage']));
  // module roles get none of these
  for (const r of ['sponsor', 'mc', 'merch', 'media', 'streamer', 'stream_tech']) {
    assert.ok(!canAny(g(r), ['registrations.edit', 'players.view_private', 'event.configure', 'staff.manage']), r);
  }
});

test('screens that gate on role names also honor granted roles', () => {
  // a legacy judge account that was also granted dj
  const me = { role: 'judge', grants: [{ role: 'judge' }, { role: 'dj' }] };
  assert.ok(holdsAnyRole(me, ['dj', 'audio_tech', 'admin']));
  assert.ok(!holdsAnyRole(me, ['admin']));
  // an account whose legacy column says judge but whose grants were changed to admin only
  assert.ok(holdsAnyRole({ role: 'judge', grants: [{ role: 'admin' }] }, ['admin']));
  // one-event grants don't open an all-event screen
  assert.ok(!holdsAnyRole({ role: 'x', grants: [{ role: 'admin', event: 'vsyc-26' }] }, ['admin']));
  assert.ok(!holdsAnyRole({}, ['admin']));
});

test('the portals for the screens that exist point where the pages are', async () => {
  const { PORTALS } = await import('./roles.ts');
  const want = { volunteers: '/volunteers', finance: '/finance', event: '/admin/event', staff: '/admin/staff' };
  for (const [id, href] of Object.entries(want)) {
    const p = PORTALS.find((x) => x.id === id);
    assert.ok(p && p.href === href && p.ready, `${id} portal`);
  }
});

test('every capability a switched admin route asks for is still held only by admin among the four existing roles', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'route.ts') files.push(p); } };
  walk('app/api');
  const asked = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/requireCapabilityRequest\(req, requestId, ([^)]*)\)/g)) {
      for (const c of m[1].matchAll(/'([a-z_.]+)'/g)) asked.add(c[1]);
    }
  }
  assert.ok(asked.size >= 4, 'found the switched routes');
  for (const cap of asked) {
    for (const role of legacy) {
      assert.equal(can(grantsFromLegacyRole(role), cap), role === 'admin', `${cap} for ${role}`);
    }
  }
});
