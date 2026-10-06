// Unit tests for team entries: the `teams` field checks, join-code checks, error messages
// and summaries. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yoyoFull } from '../presets/competitions.ts';
import { computeFee } from './divisions-core.ts';
import {
  teamChoiceIssues, joiningDivisions, joinProblem, teamWriteError, entrySummary, teamPricingNote,
  normalizeJoinCode, JOIN_CODE_RE, toSummaries, resolveTeamJoins, writeTeams,
} from './team-entries.ts';

const div = (code) => yoyoFull.divisions.find((d) => d.code === code);

test('every selected team division needs a choice; solo or unselected ones cannot have one', () => {
  assert.deepEqual(teamChoiceIssues(['1A'], {}, yoyoFull), []);
  assert.deepEqual(teamChoiceIssues(['1A', 'DBL'], undefined, yoyoFull).map((i) => i.division), ['DBL']);
  assert.deepEqual(teamChoiceIssues(['DBL', 'AP'], { DBL: { create: { name: 'X' } }, AP: { join: { code: 'ABC123' } } }, yoyoFull), []);
  const bad = teamChoiceIssues(['1A'], { '1A': { create: { name: 'X' } }, AP: { join: { code: 'ABC123' } }, NOPE: {} }, yoyoFull);
  assert.deepEqual(bad.map((i) => i.division), ['1A', 'AP', 'NOPE']);
  assert.match(bad[0].message, /not a team division/);
  assert.match(bad[1].message, /isn't selected/);
});

test('joining divisions drive the fee: per-team joins are free, per-person joins still pay', () => {
  const teams = { DBL: { join: { code: 'ABC123' } }, AP: { join: { code: 'DEF456' } }, SHOW: { create: { name: 'Act' } } };
  assert.deepEqual(joiningDivisions(teams), ['DBL', 'AP']);
  const cutoff = new Date('2000-01-01');
  const at = new Date('2026-01-01');
  const captain = computeFee(['DBL', 'AP'], yoyoFull, 0, at, 'online', cutoff, []);
  const member = computeFee(['DBL', 'AP'], yoyoFull, 0, at, 'online', cutoff, joiningDivisions(teams));
  assert.equal(captain.fee_cents, div('DBL').priceCents + div('AP').priceCents);
  assert.equal(member.fee_cents, div('AP').priceCents);
});

test('join codes: normalized, must exist, match the division and have room', () => {
  assert.equal(normalizeJoinCode(' ab c12 3 '), 'ABC123');
  assert.ok(JOIN_CODE_RE.test('A1B2C3'));
  assert.ok(!JOIN_CODE_RE.test('AB-123'));
  assert.match(joinProblem(null, 0, 'DBL', 'ABC123', yoyoFull), /No pair found/);
  assert.match(joinProblem({ division: 'AP', name: 'Shine' }, 1, 'DBL', 'ABC123', yoyoFull), /Artistic Performance pair, not Doubles/);
  assert.match(joinProblem({ division: 'DBL', name: 'Loop Twins' }, 2, 'DBL', 'ABC123', yoyoFull), /Loop Twins is full \(2 max\)/);
  assert.equal(joinProblem({ division: 'DBL', name: 'Loop Twins' }, 1, 'DBL', 'ABC123', yoyoFull), null);
});

test('database errors become friendly messages', () => {
  const taken = { code: '23505', message: 'duplicate key value violates unique constraint "vsyc_teams_division_name_key"' };
  assert.match(teamWriteError(taken, 'DBL', 'Loop Twins', yoyoFull), /pair name "Loop Twins" is already taken in Doubles/);
  const full = { code: '23514', message: 'Team Loop Twins is full (2 max)' };
  assert.match(teamWriteError(full, 'DBL', 'Loop Twins', yoyoFull), /Loop Twins is full/);
  assert.match(teamWriteError(null, 'AP', '', yoyoFull), /Couldn't save your act/);
});

test('entry and pricing summaries', () => {
  assert.equal(entrySummary(div('DBL')), 'Pair · 2 players');
  assert.equal(entrySummary(div('AP')), 'Act · 1–6 players');
  assert.equal(entrySummary(div('1A')), null);
  assert.match(teamPricingNote(div('DBL')), /^One fee per pair: the person who starts it pays; teammates join free/);
  assert.match(teamPricingNote(div('AP')), /pays their own entry/);
});

test('member rows → summaries with captain/member roles', () => {
  const rows = [
    { registration_id: 'r1', division: 'DBL', vsyc_teams: { name: 'Loop Twins', join_code: 'ABC123', captain_registration_id: 'r1' } },
    { registration_id: 'r2', division: 'DBL', vsyc_teams: [{ name: 'Loop Twins', join_code: 'ABC123', captain_registration_id: 'r1' }] },
    { registration_id: 'r3', division: 'AP', vsyc_teams: null },
  ];
  assert.deepEqual(toSummaries(rows).map((t) => [t.registration_id, t.role]), [['r1', 'captain'], ['r2', 'member']]);
});

/** A tiny fake of the supabase query builder: records inserts, answers from canned tables. */
function fakeDb({ teams = [], members = [], failInsert = {} } = {}) {
  const inserts = [];
  const from = (table) => {
    const q = { table, filters: {}, payload: null, head: false };
    const result = () => {
      if (q.payload) {
        inserts.push({ table, row: q.payload });
        const err = failInsert[table];
        if (err) return { data: null, error: err };
        if (table === 'vsyc_teams') return { data: { name: q.payload.name, join_code: 'NEW123' }, error: null };
        return { data: null, error: null };
      }
      if (table === 'vsyc_teams') return { data: teams.find((t) => t.join_code === q.filters.join_code) ?? null, error: null };
      if (table === 'vsyc_team_members' && q.head) return { count: members.filter((m) => m.team_id === q.filters.team_id).length, error: null };
      return { data: [], error: null };
    };
    const b = {
      select: (_cols, opts) => { if (opts?.head) q.head = true; return b; },
      insert: (row) => { q.payload = row; return b; },
      eq: (k, v) => { q.filters[k] = v; return b; },
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return b;
  };
  return { db: { from }, inserts };
}

test('resolveTeamJoins + writeTeams: create as captain, join as member, refuse full teams', async () => {
  const team = { id: 't1', division: 'DBL', name: 'Loop Twins', join_code: 'ABC123' };
  const { db, inserts } = fakeDb({ teams: [team], members: [{ team_id: 't1' }] });
  const choices = { DBL: { join: { code: 'abc123' } }, AP: { create: { name: '  Shine  ' } } };
  const resolved = await resolveTeamJoins(db, choices, yoyoFull);
  assert.equal(resolved.ok, true);
  const written = await writeTeams(db, 'reg-2', choices, resolved.joins, yoyoFull);
  assert.deepEqual(written, { ok: true, teams: [
    { division: 'AP', name: 'Shine', join_code: 'NEW123', role: 'captain' },
    { division: 'DBL', name: 'Loop Twins', join_code: 'ABC123', role: 'member' },
  ] });
  assert.deepEqual(inserts, [
    { table: 'vsyc_team_members', row: { team_id: 't1', registration_id: 'reg-2', division: 'DBL' } },
    { table: 'vsyc_teams', row: { division: 'AP', name: 'Shine', captain_registration_id: 'reg-2' } },
  ]);

  const full = fakeDb({ teams: [team], members: [{ team_id: 't1' }, { team_id: 't1' }] });
  const r = await resolveTeamJoins(full.db, { DBL: { join: { code: 'ABC123' } } }, yoyoFull);
  assert.deepEqual(r, { ok: false, message: 'Loop Twins is full (2 max).' });

  const clash = fakeDb({ failInsert: { vsyc_teams: { code: '23505', message: 'unique constraint "vsyc_teams_division_name_key"' } } });
  const w = await writeTeams(clash.db, 'reg-3', { DBL: { create: { name: 'Loop Twins' } } }, {}, yoyoFull);
  assert.equal(w.ok, false);
  assert.match(w.message, /already taken/);
});
