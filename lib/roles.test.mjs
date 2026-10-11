// Roles and capabilities: admin holds everything, several roles combine, grants can be per event. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, PORTALS, ROLES, ROLE_IDS, can, canAll, canAny, capabilitiesOf, capabilitiesOfRole, grantsFromLegacyRole,
  GRANTABLE_ROLES, grantsFromRows, isAdmin, isRole, portalsFor, roleIssues, rolesHeld, wouldRemoveLastAdmin,
} from './roles.ts';

test('the role table is consistent', () => {
  assert.deepEqual(roleIssues(), []);
});

test('the roles the organizer asked for all exist', () => {
  for (const r of ['sponsor', 'finance', 'admin', 'volunteer', 'dj', 'streamer', 'judge', 'stream_tech', 'media', 'mc', 'merch', 'player']) {
    assert.ok(isRole(r), `${r} is a role`);
  }
  assert.equal(isRole('nope'), false);
  assert.equal(isRole(undefined), false);
});

test('admin holds every capability, and every other role holds a strict subset', () => {
  const all = capabilitiesOfRole('admin');
  assert.equal(all.size, CAPABILITIES.length);
  for (const id of ROLE_IDS.filter((r) => r !== 'admin')) {
    const caps = capabilitiesOfRole(id);
    for (const c of caps) assert.ok(all.has(c));
    assert.ok(caps.size < all.size, `${id} is not as powerful as admin`);
  }
});

test('admin can do things only it can: staff and event setup', () => {
  const nonAdmin = ROLE_IDS.filter((r) => r !== 'admin');
  for (const c of ['staff.manage', 'event.configure']) {
    assert.equal(can([{ role: 'admin' }], c), true);
    for (const id of nonAdmin) assert.equal(can([{ role: id }], c), false, `${id} must not have ${c}`);
  }
});

test('one account, several roles: capabilities combine', () => {
  const grants = [{ role: 'player' }, { role: 'volunteer' }, { role: 'judge' }];
  assert.equal(can(grants, 'self.music'), true); // player
  assert.equal(can(grants, 'self.shifts'), true); // volunteer
  assert.equal(can(grants, 'scores.enter'), true); // judge
  assert.equal(can(grants, 'finance.view'), false);
  assert.deepEqual(rolesHeld(grants), ['player', 'volunteer', 'judge']);
  const ids = portalsFor(grants).map((p) => p.id);
  assert.ok(['my', 'my-music', 'my-shifts', 'judge'].every((i) => ids.includes(i)), ids.join());
  assert.ok(!ids.includes('finance'));
});

test('a portal appears once however many roles lead to it', () => {
  const ids = portalsFor([{ role: 'judge' }, { role: 'dj' }, { role: 'audio_tech' }]).map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('day') && ids.includes('dj') && ids.includes('judge'));
});

test('admin sees every portal', () => {
  assert.deepEqual(portalsFor([{ role: 'admin' }]).map((p) => p.id), PORTALS.map((p) => p.id));
});

test('delegation: finance sees money and registrations but not scoring or staff', () => {
  const g = [{ role: 'finance' }];
  assert.equal(can(g, 'finance.edit'), true);
  assert.equal(can(g, 'registrations.view'), true);
  assert.equal(can(g, 'registrations.edit'), false);
  assert.equal(can(g, 'scores.enter'), false);
  assert.equal(can(g, 'staff.manage'), false);
});

test('a grant limited to one event does not leak to another', () => {
  const grants = [{ role: 'judge', event: 'spring' }, { role: 'media' }];
  assert.equal(can(grants, 'scores.enter', 'spring'), true);
  assert.equal(can(grants, 'scores.enter', 'fall'), false);
  assert.equal(can(grants, 'media.upload', 'fall'), true); // all-event grant
  assert.equal(can(grants, 'scores.enter'), true); // no event asked: any grant counts
  assert.deepEqual(rolesHeld(grants, 'fall'), ['media']);
  assert.equal(isAdmin([{ role: 'admin', event: 'spring' }], 'fall'), false);
  assert.equal(isAdmin([{ role: 'admin' }], 'fall'), true);
});

test('canAny and canAll', () => {
  const g = [{ role: 'dj' }];
  assert.equal(canAny(g, ['music.play', 'finance.view']), true);
  assert.equal(canAll(g, ['music.play', 'finance.view']), false);
  assert.equal(canAll(g, ['music.play', 'music.manage']), true);
  assert.equal(canAny([], ['music.play']), false);
});

test('the old single role column still works', () => {
  assert.deepEqual(grantsFromLegacyRole('judge'), [{ role: 'judge' }]);
  assert.deepEqual(grantsFromLegacyRole('audio_tech'), [{ role: 'audio_tech' }]);
  assert.deepEqual(grantsFromLegacyRole('admin'), [{ role: 'admin' }]);
  assert.deepEqual(grantsFromLegacyRole('hacker'), []);
  assert.deepEqual(grantsFromLegacyRole(null), []);
  assert.equal(can(grantsFromLegacyRole('dj'), 'music.play'), true);
});

test('no grants, no capabilities', () => {
  assert.equal(capabilitiesOf([]).size, 0);
  assert.deepEqual(portalsFor([]), []);
});

test('every role has a label and description', () => {
  for (const [id, r] of Object.entries(ROLES)) {
    assert.ok(r.label && r.description, id);
  }
});

test('grantsFromRows drops revoked and unknown roles and collapses repeats', async () => {
  
  const out = grantsFromRows([
    { role: 'judge' },
    { role: 'judge', event_id: null },
    { role: 'dj', revoked_at: '2026-10-01T00:00:00Z' },
    { role: 'wizard' },
    { role: 'mc', event_id: 'vsyc-26' },
  ]);
  assert.deepEqual(out, [{ role: 'judge' }, { role: 'mc', event: 'vsyc-26' }]);
  assert.deepEqual(grantsFromRows(null), []);
});

// Step 4: routes check capabilities instead of `role ===`. For every account that exists today (one of the four
// legacy roles) the answer must be exactly what the old role lists gave, so nothing changes until grants are added.
test('route capability checks match the old legacy-role lists', () => {
  const legacy = ['admin', 'judge', 'dj', 'audio_tech'];
  const rules = [
    // [capability now checked, roles the old code allowed]
    ['scores.enter', ['admin', 'judge']], // scores, ladder, bracket viewer
    ['brackets.run', ['admin', 'judge']], // bracket votes
    ['music.play', ['admin', 'dj', 'audio_tech']], // DJ music URLs, run-order music
    ['runorder.edit', ['admin', 'dj', 'audio_tech', 'judge']], // requireRunOrderEditorRequest
    ['registrations.edit', ['admin']], // comp codes, spectators, contestants, resend confirmations
    ['finance.edit', ['admin']], // budget
    ['volunteers.manage', ['admin']],
    ['event.configure', ['admin']], // event flags
    ['players.view_private', ['admin']], // ops dashboard
  ];
  for (const [cap, allowed] of rules) {
    for (const role of legacy) {
      assert.equal(can(grantsFromLegacyRole(role), cap), allowed.includes(role), `${cap} for ${role}`);
    }
  }
});

test('every portal that is ready points at a real route shape, and unbuilt ones are marked', () => {
  for (const p of PORTALS) {
    assert.ok(p.href.startsWith('/'), p.id);
    assert.equal(typeof p.ready, 'boolean', p.id);
  }
  assert.equal(new Set(PORTALS.map((p) => p.id)).size, PORTALS.length, 'portal ids are unique');
});

test('the last admin cannot be removed, and only whole-event admins count', () => {
  const rows = [
    { auth_user_id: 'a', role: 'admin', is_active: true },
    { auth_user_id: 'b', role: 'judge', is_active: true },
  ];
  assert.equal(wouldRemoveLastAdmin(rows, { auth_user_id: 'a', role: 'admin' }), true);
  assert.equal(wouldRemoveLastAdmin(rows, { auth_user_id: 'b', role: 'judge' }), false);
  // a second active admin makes it fine
  assert.equal(wouldRemoveLastAdmin([...rows, { auth_user_id: 'c', role: 'admin', is_active: true }], { auth_user_id: 'a', role: 'admin' }), false);
  // inactive, revoked or one-event admins don't count as cover
  const weak = [
    { auth_user_id: 'a', role: 'admin', is_active: true },
    { auth_user_id: 'x', role: 'admin', is_active: false },
    { auth_user_id: 'y', role: 'admin', is_active: true, revoked_at: '2026-10-01T00:00:00Z' },
    { auth_user_id: 'z', role: 'admin', is_active: true, event_id: 'vsyc-26' },
  ];
  assert.equal(wouldRemoveLastAdmin(weak, { auth_user_id: 'a', role: 'admin' }), true);
  // revoking an event-limited admin grant never blocks
  assert.equal(wouldRemoveLastAdmin(weak, { auth_user_id: 'z', role: 'admin', event_id: 'vsyc-26' }), false);
});

test('grantable roles leave out the automatic ones', () => {
  assert.ok(GRANTABLE_ROLES.includes('judge') && GRANTABLE_ROLES.includes('admin'));
  assert.ok(!GRANTABLE_ROLES.includes('player') && !GRANTABLE_ROLES.includes('volunteer'));
});

test('form_reader reads form answers and nothing else, and an admin can grant it', () => {
  assert.deepEqual([...capabilitiesOfRole('form_reader')], ['forms.review']);
  assert.ok(can([{ role: 'form_reader' }], 'forms.review'));
  assert.ok(!can([{ role: 'form_reader' }], 'registrations.view'));
  assert.ok(!can([{ role: 'judge' }], 'forms.review'));
  assert.ok(can([{ role: 'admin' }], 'forms.review'));
  assert.ok(GRANTABLE_ROLES.includes('form_reader'));
  assert.ok(portalsFor([{ role: 'form_reader' }]).some((p) => p.id === 'forms'));
});
