/**
 * Team entries (doubles, groups, acts) for registration: what a registrant asks for per team
 * division, the checks on it, and the database reads/writes that create or join a team.
 *
 * The pure helpers take the `competition` block as an argument and import types only, so
 * `npm test` can run them under plain Node (see lib/team-entries.test.mjs).
 * Rules: docs/FORMATS.md → Teams. Schema: migration 0039 (vsyc_teams, vsyc_team_members).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DivisionDef, EntryDef, competition as Competition } from '../contest.config';

type CompetitionConfig = typeof Competition;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Per team division: start a new team, or join one with its code. */
export type TeamChoice = { create: { name: string } } | { join: { code: string } };
export type TeamChoices = Record<string, TeamChoice>;

/** A team this registration is on, as the API returns it. */
export interface TeamSummary {
  division: string;
  name: string;
  join_code: string;
  role: 'captain' | 'member';
}

/** Codes are 6 uppercase hex characters by default; accept any 4–12 letters/digits in case an admin set one. */
export const JOIN_CODE_RE = /^[A-Z0-9]{4,12}$/;
export const TEAM_NAME_MAX = 60;

export const normalizeJoinCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

const entryOf = (d: DivisionDef | undefined): EntryDef => d?.entry ?? { type: 'solo' };
const find = (c: CompetitionConfig, code: string) => c.divisions.find((d) => d.code === code);
const labelOf = (d: DivisionDef | undefined) => {
  const e = entryOf(d);
  return e.type === 'team' ? e.label : 'team';
};

/** "Pair · 2 players", "Act · 1–6 players"; null for solo divisions. */
export function entrySummary(d: DivisionDef): string | null {
  const e = entryOf(d);
  if (e.type !== 'team') return null;
  const n = e.min === e.max ? `${e.max}` : `${e.min}–${e.max}`;
  return `${e.label} · ${n} player${e.max === 1 ? '' : 's'}`;
}

/** How a team division is priced, in a sentence. */
export function teamPricingNote(d: DivisionDef): string | null {
  const e = entryOf(d);
  if (e.type !== 'team') return null;
  return e.pricing === 'team'
    ? `One fee per ${e.label.toLowerCase()}: the person who starts it pays; teammates join free.`
    : `Each ${e.label.toLowerCase()} member pays their own entry.`;
}

/** Problems with the `teams` field for a division selection. Empty = valid. */
export function teamChoiceIssues(selected: string[], teams: Record<string, unknown> | undefined, c: CompetitionConfig): { division: string; message: string }[] {
  const out: { division: string; message: string }[] = [];
  const t = teams ?? {};
  for (const code of selected) {
    const d = find(c, code);
    if (entryOf(d).type === 'team' && !t[code]) {
      out.push({ division: code, message: `${d!.name}: start a new ${labelOf(d).toLowerCase()} or join one with a code` });
    }
  }
  for (const code of Object.keys(t)) {
    const d = find(c, code);
    if (!d) out.push({ division: code, message: `Unknown division: ${code}` });
    else if (entryOf(d).type !== 'team') out.push({ division: code, message: `${d.name} is not a team division` });
    else if (!selected.includes(code)) out.push({ division: code, message: `${d.name} isn't selected, so it can't have a ${labelOf(d).toLowerCase()}` });
  }
  return out;
}

/** Team divisions where this registrant joins someone else's team (for computeFee's `joining`). */
export function joiningDivisions(teams: TeamChoices | undefined): string[] {
  return Object.entries(teams ?? {}).filter(([, v]) => 'join' in v).map(([k]) => k);
}

export interface FoundTeam {
  id: string;
  division: string;
  name: string;
  join_code: string;
}

/** Why a join code can't be used for `division`, or null if it can. `members` counts the team today. */
export function joinProblem(team: Pick<FoundTeam, 'division' | 'name'> | null, members: number, division: string, code: string, c: CompetitionConfig): string | null {
  const d = find(c, division);
  const label = labelOf(d).toLowerCase();
  if (!team) return `No ${label} found with code ${code}. Check the code with your ${label}'s captain.`;
  if (team.division !== division) {
    return `Code ${code} is for a ${find(c, team.division)?.name ?? team.division} ${label}, not ${d?.name ?? division}.`;
  }
  const e = entryOf(d);
  if (e.type === 'team' && members >= e.max) return `${team.name} is full (${e.max} max).`;
  return null;
}

/** A friendly message for a failed team insert (Postgres error from the triggers or constraints). */
export function teamWriteError(err: { code?: string; message?: string; details?: string } | null, division: string, teamName: string, c: CompetitionConfig): string {
  const d = find(c, division);
  const label = labelOf(d).toLowerCase();
  const where = d?.name ?? division;
  const text = `${err?.message ?? ''} ${err?.details ?? ''}`;
  if (err?.code === '23505') {
    if (/division_name|\(division, name\)/.test(text)) return `The ${label} name "${teamName}" is already taken in ${where}. Pick another name.`;
    if (/registration_id, division|registration_id_division/.test(text)) return `You're already on a ${label} in ${where}.`;
    if (/captain/.test(text)) return `You already started a ${label} in ${where}.`;
  }
  if (err?.code === '23514' && /full/i.test(text)) return `${teamName} is full. Ask the captain, or start your own ${label}.`;
  return `Couldn't save your ${label} for ${where}. Please try again.`;
}

const isJoinCodeClash = (err: { code?: string; message?: string; details?: string } | null) =>
  err?.code === '23505' && /join_code/.test(`${err.message ?? ''} ${err.details ?? ''}`);

// ---------------------------------------------------------------- database

/** Member count for a team. */
async function memberCount(db: Db, teamId: string): Promise<number> {
  const { count, error } = await db.from('vsyc_team_members').select('registration_id', { count: 'exact', head: true }).eq('team_id', teamId);
  if (error) throw error;
  return count ?? 0;
}

/** Look a team up by join code, with its member count. */
export async function findTeamByCode(db: Db, rawCode: string): Promise<{ team: FoundTeam; members: number } | null> {
  const code = normalizeJoinCode(rawCode);
  const { data, error } = await db.from('vsyc_teams').select('id, division, name, join_code').eq('join_code', code).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { team: data as FoundTeam, members: await memberCount(db, data.id as string) };
}

/**
 * Checks every join code before anything is written: the team exists, is in that division and
 * has room. (The insert trigger checks room again, so a race still fails cleanly.)
 */
export async function resolveTeamJoins(db: Db, teams: TeamChoices | undefined, c: CompetitionConfig):
  Promise<{ ok: true; joins: Record<string, FoundTeam> } | { ok: false; message: string }> {
  const joins: Record<string, FoundTeam> = {};
  for (const [division, choice] of Object.entries(teams ?? {})) {
    if (!('join' in choice)) continue;
    const code = normalizeJoinCode(choice.join.code);
    const found = await findTeamByCode(db, code);
    const problem = joinProblem(found?.team ?? null, found?.members ?? 0, division, code, c);
    if (problem) return { ok: false, message: problem };
    joins[division] = found!.team;
  }
  return { ok: true, joins };
}

/**
 * Creates the registrant's new teams (they're the captain; a trigger adds them as a member)
 * and adds them to the teams they're joining. On failure the caller deletes the registration,
 * which cascades to anything written here.
 */
export async function writeTeams(db: Db, registrationId: string, teams: TeamChoices | undefined, joins: Record<string, FoundTeam>, c: CompetitionConfig):
  Promise<{ ok: true; teams: TeamSummary[] } | { ok: false; message: string }> {
  const out: TeamSummary[] = [];
  for (const [division, choice] of Object.entries(teams ?? {})) {
    if ('create' in choice) {
      const name = choice.create.name.trim();
      let res = await db.from('vsyc_teams').insert({ division, name, captain_registration_id: registrationId }).select('name, join_code').single();
      // A random join code can collide with an existing one; one retry gets a fresh default.
      if (isJoinCodeClash(res.error)) {
        res = await db.from('vsyc_teams').insert({ division, name, captain_registration_id: registrationId }).select('name, join_code').single();
      }
      if (res.error || !res.data) {
        console.error('[teams] create failed:', res.error);
        return { ok: false, message: teamWriteError(res.error, division, name, c) };
      }
      out.push({ division, name: res.data.name, join_code: res.data.join_code, role: 'captain' });
    } else {
      const team = joins[division];
      if (!team) return { ok: false, message: teamWriteError(null, division, '', c) };
      const { error } = await db.from('vsyc_team_members').insert({ team_id: team.id, registration_id: registrationId, division });
      if (error) {
        console.error('[teams] join failed:', error);
        return { ok: false, message: teamWriteError(error, division, team.name, c) };
      }
      out.push({ division, name: team.name, join_code: team.join_code, role: 'member' });
    }
  }
  return { ok: true, teams: sortTeams(out, c) };
}

/** The teams a registration is on (captain or member), in config division order. */
export async function fetchRegistrationTeams(db: Db, registrationId: string, c: CompetitionConfig): Promise<TeamSummary[]> {
  const { data, error } = await db
    .from('vsyc_team_members')
    .select('registration_id, division, vsyc_teams(name, join_code, captain_registration_id)')
    .eq('registration_id', registrationId);
  if (error) throw error;
  return sortTeams(toSummaries(data ?? []).map((t) => ({ division: t.division, name: t.name, join_code: t.join_code, role: t.role })), c);
}

/** Every team membership, for the admin dashboard: registration_id → teams. */
export async function fetchAllTeamMemberships(db: Db, c: CompetitionConfig): Promise<Record<string, TeamSummary[]>> {
  const { data, error } = await db
    .from('vsyc_team_members')
    .select('registration_id, division, vsyc_teams(name, join_code, captain_registration_id)');
  if (error) throw error;
  const out: Record<string, TeamSummary[]> = {};
  for (const { registration_id, ...t } of toSummaries(data ?? [])) (out[registration_id] ??= []).push(t);
  for (const k of Object.keys(out)) out[k] = sortTeams(out[k], c);
  return out;
}

type MemberRow = {
  registration_id: string;
  division: string;
  vsyc_teams: { name: string; join_code: string; captain_registration_id: string } | { name: string; join_code: string; captain_registration_id: string }[] | null;
};

/** Member rows (with the embedded team) → summaries; role is captain when the team's captain is this row's registration. */
export function toSummaries(rows: MemberRow[]): (TeamSummary & { registration_id: string })[] {
  const out: (TeamSummary & { registration_id: string })[] = [];
  for (const r of rows) {
    const t = Array.isArray(r.vsyc_teams) ? r.vsyc_teams[0] : r.vsyc_teams;
    if (!t) continue;
    const rid = r.registration_id;
    out.push({
      registration_id: rid,
      division: r.division,
      name: t.name,
      join_code: t.join_code,
      role: t.captain_registration_id === rid ? 'captain' : 'member',
    });
  }
  return out;
}

function sortTeams(teams: TeamSummary[], c: CompetitionConfig): TeamSummary[] {
  const order = c.divisions.map((d) => d.code);
  return [...teams].sort((a, b) => order.indexOf(a.division) - order.indexOf(b.division));
}
