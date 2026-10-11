// Route-level tests for /api/admin/roles (staff and roles): only an active account holding staff.manage gets in, and
// a bad grant body is refused before the database is touched. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadRoute, stubs } from './route-harness.mjs';
import { grantsFromLegacyRole } from '../roles.ts';

const { GET, POST, DELETE } = await loadRoute('app/api/admin/roles/route.ts');

let touched;
function setup(identity) {
  touched = 0;
  stubs.set('supabase-admin', { createAdminClient: () => { touched++; throw new Error('database must not be touched'); } });
  stubs.set('auth-staff', {
    getBearerToken: (req) => { const h = req.headers.get('authorization') ?? ''; return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null; },
    getStaffIdentityFromToken: async () => identity,
  });
}
const who = (role, isActive = true) => ({ authUserId: '00000000-0000-4000-8000-000000000001', role, isActive, grants: grantsFromLegacyRole(role) });
const req = (method, body, auth = 'Bearer t') =>
  new Request('http://localhost/api/admin/roles', { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => stubs.reset());

test('401 with no token, 403 for anyone without staff.manage', async () => {
  setup(who('admin'));
  assert.equal((await GET(new Request('http://localhost/api/admin/roles'))).status, 401);
  for (const identity of [null, who('admin', false), who('judge'), who('dj'), who('audio_tech')]) {
    setup(identity);
    for (const call of [() => GET(req('GET')), () => POST(req('POST', {})), () => DELETE(req('DELETE', {}))]) {
      assert.equal((await call()).status, 403, JSON.stringify(identity));
    }
  }
  assert.equal(touched, 0);
});

test('an admin with a malformed grant is refused before the database', async () => {
  setup(who('admin'));
  for (const body of [{}, { auth_user_id: 'nope', role: 'judge' }, { auth_user_id: '00000000-0000-4000-8000-000000000002', role: '' }, { auth_user_id: '00000000-0000-4000-8000-000000000002', role: 'judge', extra: 1 }]) {
    assert.equal((await POST(req('POST', body))).status, 400, JSON.stringify(body));
  }
  assert.equal(touched, 0);
});

test('a role nobody can hand out by hand is refused', async () => {
  setup(who('admin'));
  const res = await POST(req('POST', { auth_user_id: '00000000-0000-4000-8000-000000000002', role: 'player' }));
  assert.equal(res.status, 400);
  assert.equal(touched, 0);
});
