// Route-level tests for the shared admin guard (build plan 4.19): the per-IP rate limit and who gets in.
// Every /api/admin and /api/ops route calls requireAdminRequest, so this covers all of them. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadRoute, stubs } from './route-harness.mjs';
import { grantsFromLegacyRole } from '../roles.ts';

const { requireAdminRequest, requireRunOrderEditorRequest, requireCapabilityRequest, ADMIN_RATE_LIMIT } = await loadRoute('lib/auth/admin-request.ts');

let limiterCalls;
function setup({ allowed = true, identity = null } = {}) {
  limiterCalls = [];
  stubs.set('rate-limit', {
    checkRateLimit: async (...a) => { limiterCalls.push(a); return allowed; },
    getClientIp: (h) => h.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown',
  });
  stubs.set('auth-staff', {
    getBearerToken: (req) => { const h = req.headers.get('authorization') ?? ''; return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null; },
    getStaffIdentityFromToken: async () => identity,
  });
}
const req = (headers = {}) => new Request('http://localhost/api/admin/x', { headers: { 'x-forwarded-for': '9.9.9.9', ...headers } });
const admin = { role: 'admin', isActive: true };

beforeEach(() => { stubs.reset(); setup(); });

test('the limit is 60 per IP per minute, shared by every admin route', async () => {
  assert.deepEqual(ADMIN_RATE_LIMIT, { max: 60, windowMinutes: 1 });
  setup({ identity: admin });
  await requireAdminRequest(req({ authorization: 'Bearer t' }), 'r1');
  assert.deepEqual(limiterCalls, [['9.9.9.9', 'admin', 60, 1]]);
});

test('429 with Retry-After when the IP is over the limit, before the token is even looked at', async () => {
  setup({ allowed: false, identity: admin });
  const res = await requireAdminRequest(req({ authorization: 'Bearer t' }), 'r1');
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '60');
});

test('401 with no bearer token', async () => {
  const res = await requireAdminRequest(req(), 'r1');
  assert.equal(res.status, 401);
});

test('403 for a token with no staff account, an inactive one, or a non-admin role', async () => {
  for (const identity of [null, { role: 'admin', isActive: false }, { role: 'judge', isActive: true }, { role: 'dj', isActive: true }]) {
    setup({ identity });
    const res = await requireAdminRequest(req({ authorization: 'Bearer t' }), 'r1');
    assert.equal(res.status, 403, JSON.stringify(identity));
  }
});

test('an active admin gets their identity back', async () => {
  setup({ identity: admin });
  const out = await requireAdminRequest(req({ authorization: 'Bearer t' }), 'r1');
  assert.equal(out, admin);
});

test('the run-order guard is not rate limited here and still admits admins, DJs, audio techs and judges', async () => {
  for (const role of ['admin', 'dj', 'audio_tech', 'judge']) {
    setup({ identity: { role, isActive: true } });
    const out = await requireRunOrderEditorRequest(req({ authorization: 'Bearer t' }), 'r1');
    assert.equal(out.role, role);
  }
  assert.deepEqual(limiterCalls, [], 'live scoring and DJ traffic is never throttled by the admin limit');
  setup({ identity: { role: 'player', isActive: true } });
  assert.equal((await requireRunOrderEditorRequest(req({ authorization: 'Bearer t' }), 'r1')).status, 403);
});

test('the capability guard admits holders of any listed capability and nobody else', async () => {
  const who = (role, isActive = true) => ({ role, isActive, grants: grantsFromLegacyRole(role) });
  const call = async (identity, ...caps) => { setup({ identity }); return requireCapabilityRequest(req({ authorization: 'Bearer t' }), 'r1', ...caps); };
  assert.equal((await call(who('admin'), 'staff.manage')).role, 'admin');
  assert.equal((await call(who('judge'), 'staff.manage')).status, 403);
  assert.equal((await call(who('admin', false), 'staff.manage')).status, 403);
  assert.equal((await call(null, 'staff.manage')).status, 403);
  assert.equal((await call(who('judge'), 'staff.manage', 'runorder.edit')).role, 'judge');
});
