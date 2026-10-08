// Route-level tests for POST /api/register (build plan 4.19): every validation branch before money is
// involved, the comp-code claim and release, and the happy path's shape. Runs the real route with its
// database, rate limiter, bot check and email stubbed. Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The registration window must be open for these tests (the contest config reads this at import).
process.env.ONLINE_REG_CUTOFF_ISO = '2999-01-01T00:00:00Z';
const { loadRoute, stubs } = await import('./route-harness.mjs');
const { POST } = await loadRoute('app/api/register/route.ts');

const valid = (over = {}) => ({
  first_name: 'Sam', last_name: 'Rivera', age_on_event: 25, email: 'Sam@Example.org', phone: '555-555-5555',
  city: 'Rockville', state: 'MD', divisions: ['1A'], division_styles: {},
  liability_waiver_accepted: true, photo_video_consent: true, code_of_conduct_accepted: true,
  emergency_contact_name: 'Pat Rivera', emergency_contact_phone: '555-555-0000', emergency_contact_relationship: 'Parent',
  ...over,
});

let inserted, rpcCalls, audits, emailJobs, flags, db;

function setup({ insertError = null, redeem = null, locked = false, allowed = true, turnstile = true, teamsOk = true } = {}) {
  inserted = []; rpcCalls = []; audits = []; emailJobs = []; globalThis.__afterJobs = [];
  flags = { online_registration_open: true };
  db = {
    from(table) {
      const q = { table };
      const chain = {
        insert(row) { q.row = row; inserted.push({ table, row }); return chain; },
        select() { return chain; },
        delete() { q.deleted = true; return chain; },
        eq() { return chain; },
        single() { return Promise.resolve(insertError ? { data: null, error: insertError } : { data: { id: 'reg-1' }, error: null }); },
        then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
      };
      return chain;
    },
    rpc(name, args) { rpcCalls.push([name, args]); return Promise.resolve(name === 'redeem_comp_code' ? { data: redeem, error: redeem === null ? { message: 'none' } : null } : { data: null, error: null }); },
  };
  stubs.set('rate-limit', { checkRateLimit: async () => allowed, getClientIp: () => '1.2.3.4' });
  stubs.set('turnstile', { verifyTurnstile: async () => turnstile });
  stubs.set('event-flags', { getEventFlagBoolean: async (k, fb) => flags[k] ?? fb });
  stubs.set('comp-code-guard', { isCodeLocked: async () => locked, recordFailedCodeAttempt: async () => { rpcCalls.push(['failed_attempt']); } });
  stubs.set('supabase-admin', { createAdminClient: () => db, hasAdminCredentials: () => true });
  stubs.set('audit', { logAudit: async (a, o) => { audits.push([a, o]); } });
  stubs.set('team-entries', {
    joiningDivisions: () => [],
    resolveTeamJoins: async () => (teamsOk ? { ok: true, joins: {} } : { ok: false, message: 'That team is full' }),
    writeTeams: async () => ({ ok: true, teams: [] }),
  });
  stubs.set('email', { sendConfirmationEmail: async (p, o) => { emailJobs.push([p, o]); } });
}

const call = (body, raw) => POST(new Request('http://localhost/api/register', {
  method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'test' },
  body: raw ?? JSON.stringify(body),
}));
const errorOf = async (res) => (await res.json()).error;

beforeEach(() => { stubs.reset(); setup(); });

test('429 when the IP has registered too often', async () => {
  setup({ allowed: false });
  const res = await call(valid());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '3600');
  assert.equal(inserted.length, 0);
});

test('400 for a body that is not JSON', async () => {
  const res = await call(null, '{nope');
  assert.equal(res.status, 400);
  assert.match((await errorOf(res)).message, /JSON/);
});

test('403 when the bot check fails', async () => {
  setup({ turnstile: false });
  assert.equal((await call(valid())).status, 403);
  assert.equal(inserted.length, 0);
});

test('400 with the first problem named when the form is invalid', async () => {
  const res = await call(valid({ email: 'not-an-email' }));
  assert.equal(res.status, 400);
  assert.equal(inserted.length, 0);
});

test('400 for each required agreement left unticked', async () => {
  for (const field of ['liability_waiver_accepted', 'photo_video_consent', 'code_of_conduct_accepted']) {
    const res = await call(valid({ [field]: false }));
    assert.equal(res.status, 400, field);
  }
  assert.equal(inserted.length, 0);
});

test('a minor needs a parent or guardian', async () => {
  const res = await call(valid({ age_on_event: 12 }));
  assert.equal(res.status, 400);
  assert.match((await errorOf(res)).message, /[Pp]arent/);
});

test('an unknown division is refused', async () => {
  assert.equal((await call(valid({ divisions: ['NOPE'] }))).status, 400);
});

test('the honeypot field turns a submission away', async () => {
  const res = await call(valid({ _hp: 'bot' }));
  assert.equal(res.status, 400);
  assert.equal(inserted.length, 0);
});

test('422 while registration is paused by the admin flag', async () => {
  flags.online_registration_open = false;
  const res = await call(valid());
  assert.equal(res.status, 422);
  assert.match((await errorOf(res)).message, /paused/);
  assert.equal(inserted.length, 0);
});

test('422 when a team join fails, before any comp code is claimed', async () => {
  setup({ teamsOk: false });
  const res = await call(valid({ comp_code: 'FREE50' }));
  assert.equal(res.status, 422);
  assert.deepEqual(rpcCalls, []);
});

test('422 for a locked comp code, and nothing is claimed', async () => {
  setup({ locked: true });
  const res = await call(valid({ comp_code: 'FREE50' }));
  assert.equal(res.status, 422);
  assert.ok(!rpcCalls.some(([n]) => n === 'redeem_comp_code'));
});

test('422 for a comp code that does not redeem; the failed attempt and an audit entry are recorded', async () => {
  setup({ redeem: null });
  const res = await call(valid({ comp_code: 'BOGUS' }));
  assert.equal(res.status, 422);
  assert.ok(rpcCalls.some(([n]) => n === 'failed_attempt'));
  assert.equal(audits[0][0], 'comp_code_invalid_attempt');
  assert.equal(inserted.length, 0);
});

test('a failed insert releases the comp code it claimed and answers 502', async () => {
  setup({ redeem: 100, insertError: { message: 'boom' } });
  const res = await call(valid({ comp_code: 'FREE' }));
  assert.equal(res.status, 502);
  assert.deepEqual(rpcCalls.map(([n]) => n), ['redeem_comp_code', 'release_comp_code']);
});

test('201: stores the registration, audits it, and queues the confirmation email after the response', async () => {
  const res = await call(valid());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.id, 'reg-1');
  assert.equal(typeof body.fee_cents, 'number');
  assert.match(body.confirm_url, /\/confirm\?id=reg-1$/);
  assert.match(body.music_upload_url, /\/upload\?token=/);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, 'vsyc_registrations');
  assert.equal(inserted[0].row.email, 'sam@example.org', 'email is lowercased');
  assert.equal(inserted[0].row.registration_source, 'online');
  assert.equal(audits[0][0], 'created');
  assert.equal(emailJobs.length, 0, 'the email waits for after()');
  await Promise.all(globalThis.__afterJobs.map((j) => j()));
  assert.equal(emailJobs.length, 1);
  assert.equal(emailJobs[0][0].to, 'sam@example.org');
});

test('a minor keeps no public profile fields, even if the request asked for them', async () => {
  const res = await call(valid({ age_on_event: 12, parent_name: 'Pat', parent_email: 'pat@example.org', parent_consented: true, nickname: 'Sammy', bio: 'hi', is_public: true, socials: { instagram: 'x' } }));
  assert.equal(res.status, 201);
  const row = inserted[0].row;
  assert.equal(row.nickname, null);
  assert.equal(row.bio, null);
  assert.equal(row.is_public, false);
  assert.deepEqual(row.socials, {});
  await Promise.all(globalThis.__afterJobs.map((j) => j()));
  assert.equal(emailJobs.length, 2, 'the parent gets a confirmation too');
});

test('an entrant from the champion state must give a home address and confirm it', async () => {
  const res = await call(valid({ state: 'VA' }));
  assert.equal(res.status, 400);
  assert.equal(inserted.length, 0);
});

test('the home address is kept only for the champion state', async () => {
  await call(valid({ state: 'VA', home_address: '1 Main St', home_zip: '20190', home_state_confirmed: true }));
  await call(valid({ state: 'MD', home_address: '2 Oak St', home_zip: '20850' }));
  const [va, md] = inserted.map((i) => i.row);
  assert.equal(va.home_address, '1 Main St');
  assert.equal(md.home_address, null);
  assert.equal(md.home_zip, null);
});
