import type { SupabaseClient } from '@supabase/supabase-js';
import { competition, type DivisionDef, type Scoring } from '@/contest.config';
import {
  advancers, betterOf, bracketPlacements, compareLadder, compareScores, ladderResult, roundsOf,
  type BracketMatch, type LadderAttempt,
} from '@/lib/divisions-core';
import { isNameRestricted, legalName, type DisplayNameParts } from '@/lib/display-name';

/**
 * Standings for every format (docs/FORMATS.md → Standings). Shared by the public /results board,
 * the admin results page, round advancing and the winner survey invites, so "who placed" is
 * computed the same way everywhere.
 *
 * - freestyle / panel / manual: vsyc_results, one row per judge per entrant per round, averaged.
 * - ladder: vsyc_ladder_attempts → ladderResult / compareLadder.
 * - bracket: vsyc_bracket_matches → bracketPlacements, then everyone else by the round reached.
 * - showcase: not judged, always empty.
 *
 * The ranking itself (computeStandings) is pure; fetchStandings only loads the rows.
 */

/** A division code from contest.config.ts → competition.divisions */
export type Division = string;

export const DIVISIONS: { code: Division; label: string }[] =
  competition.divisions.map((d) => ({ code: d.code, label: d.name }));

/** Places that win prizes (and get the winner survey). */
export const PRIZE_PLACES = 3;

export interface StandingRow {
  /** 1-based; tied entrants share a place (1, 2, 2, 4) */
  place: number;
  registration_id: string;
  /** Public name: the team name in team divisions; minors who aren't public never get a legal full name */
  display_name: string;
  city: string | null;
  state: string | null;
  /** The ranked number: average score, rung or points, or (bracket) the furthest round reached */
  value: number;
  /** value formatted for display: "92.40", "39.80 s", "Rung 7 of 10", "Champion" */
  value_label: string;
  /** e.g. "3 judges", "11 attempts", or the round an eliminated entrant went out in */
  detail?: string;
}

export interface DivisionStandings {
  format: Scoring['format'];
  better: 'higher' | 'lower';
  /** Per round, in order (one entry for single-round, ladder and bracket divisions; none for showcase) */
  rounds: { name: string; rows: StandingRow[] }[];
  /** Overall order */
  final: StandingRow[];
}

/** One judge's score for one entrant in one round (the columns of vsyc_results we use). */
export interface ResultRow {
  registration_id: string;
  division: string;
  round?: number | null;
  display_name: string;
  city: string | null;
  state: string | null;
  final_score: number | string;
}

export interface LadderAttemptRow extends LadderAttempt {
  division: string;
  registration_id: string;
}

export interface BracketMatchRow extends Omit<BracketMatch, 'entry_a' | 'entry_b' | 'winner'> {
  division: string;
  entry_a: string | null;
  entry_b: string | null;
  winner: string | null;
}

export interface PublicEntry { display_name: string; city: string | null; state: string | null }

export interface StandingsInput {
  results?: ResultRow[];
  ladder?: LadderAttemptRow[];
  matches?: BracketMatchRow[];
  /** Public names for ladder / bracket entrants, keyed `${division}:${registration_id}` */
  names?: Map<string, PublicEntry>;
}

export const nameKey = (division: string, registrationId: string) => `${division}:${registrationId}`;

// ---------------------------------------------------------------- names

export interface RegistrationNameRow extends DisplayNameParts {
  id: string;
  city?: string | null;
  state?: string | null;
}

/**
 * Public name for a registrant. Mirrors vsyc_public_name() in migration 0039: minors who
 * aren't opted in get a nickname, a bracket name that isn't their legal name, or first name +
 * last initial, and their city is withheld.
 */
export function publicEntry(r: RegistrationNameRow, teamName?: string | null): PublicEntry {
  const restricted = isNameRestricted(r);
  const legal = legalName(r);
  const clean = (v?: string | null) => (v ?? '').trim();
  let name: string;
  if (restricted) {
    const bracket = clean(r.preferred_bracket_name);
    const safeBracket = bracket && bracket.toLowerCase() !== legal.toLowerCase() ? bracket : '';
    const first = clean(r.first_name);
    const initial = clean(r.last_name).charAt(0);
    name = clean(r.nickname) || safeBracket || (first && initial ? `${first} ${initial}.` : first || 'Junior competitor');
  } else {
    name = clean(r.preferred_bracket_name) || legal || 'Unnamed competitor';
  }
  return {
    display_name: clean(teamName) || name,
    city: restricted ? null : (r.city ?? null),
    state: r.state ?? null,
  };
}

// ---------------------------------------------------------------- formatting

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "92.40", "39.80 s", "1,204 catches" */
export function scoreLabel(value: number, scoring: Scoring): string {
  if (scoring.format !== 'manual') return value.toFixed(2);
  const unit = (scoring.unit ?? 'points').trim();
  if (/^(s|secs?|seconds?)$/i.test(unit)) return `${value.toFixed(2)} s`;
  if (/^points?$/i.test(unit)) return value.toFixed(2);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
}

const ORDINAL = ['', 'Champion', 'Runner-up', '3rd', '4th'];

/** Label for the furthest bracket round reached, counted back from the final. */
export function bracketRoundLabel(reached: number, rounds: number): string {
  const back = rounds - reached;
  if (back === 0) return 'Final';
  if (back === 1) return 'Semifinal';
  if (back === 2) return 'Quarterfinal';
  return `Round ${reached}`;
}

/** Give tied neighbours the same place (standard competition ranking: 1, 2, 2, 4). */
function placeRows<T>(sorted: T[], same: (a: T, b: T) => boolean, toRow: (t: T, place: number) => StandingRow): StandingRow[] {
  let place = 0;
  return sorted.map((t, i) => {
    if (i === 0 || !same(sorted[i - 1], t)) place = i + 1;
    return toRow(t, place);
  });
}

// ---------------------------------------------------------------- per format

function scoredStandings(def: DivisionDef, rows: ResultRow[]): DivisionStandings {
  const better = betterOf(def.scoring);
  const defs = roundsOf(def);
  const cmp = compareScores(better);

  const rounds = defs.map((rd, idx) => {
    const n = idx + 1;
    const byReg = new Map<string, { first: ResultRow; sum: number; count: number }>();
    for (const r of rows) {
      if ((r.round ?? 1) !== n) continue;
      const e = byReg.get(r.registration_id) ?? { first: r, sum: 0, count: 0 };
      e.sum += Number(r.final_score) || 0;
      e.count += 1;
      byReg.set(r.registration_id, e);
    }
    const entries = [...byReg.values()]
      .map((e) => ({ ...e, avg: r2(e.sum / e.count) }))
      .sort((a, b) => cmp(a.avg, b.avg) || a.first.display_name.localeCompare(b.first.display_name));
    return {
      name: rd.name,
      rows: placeRows(entries, (a, b) => a.avg === b.avg, (e, place) => ({
        place,
        registration_id: e.first.registration_id,
        display_name: e.first.display_name,
        city: e.first.city,
        state: e.first.state,
        value: e.avg,
        value_label: scoreLabel(e.avg, def.scoring),
        detail: plural(e.count, 'judge'),
      })),
    };
  });

  return { format: def.scoring.format, better, rounds, final: overallFromRounds(rounds) };
}

/**
 * Overall order for a multi-round division: the last round's ranking first, then entrants who
 * went out earlier, latest round first, in their rank order there.
 */
export function overallFromRounds(rounds: { name: string; rows: StandingRow[] }[]): StandingRow[] {
  if (rounds.length === 1) return rounds[0].rows;
  const seen = new Set<string>();
  const out: StandingRow[] = [];
  for (let i = rounds.length - 1; i >= 0; i--) {
    const group = rounds[i].rows.filter((r) => !seen.has(r.registration_id));
    const offset = out.length;
    group.forEach((r) => {
      seen.add(r.registration_id);
      // Ties from that round stay tied, placed below everyone ahead of them.
      out.push({
        ...r,
        place: offset + group.findIndex((g) => g.place === r.place) + 1,
        detail: i === rounds.length - 1 ? r.detail : `Out in ${rounds[i].name}`,
      });
    });
  }
  return out;
}

function ladderStandings(def: DivisionDef, attempts: LadderAttemptRow[], names: Map<string, PublicEntry>): DivisionStandings {
  const scoring = def.scoring;
  if (scoring.format !== 'ladder') throw new Error('not a ladder');
  const byReg = new Map<string, LadderAttempt[]>();
  for (const a of attempts) {
    const list = byReg.get(a.registration_id) ?? [];
    list.push({ trick_index: a.trick_index, attempt: a.attempt, landed: a.landed });
    byReg.set(a.registration_id, list);
  }
  const cmp = compareLadder(scoring);
  const byPoints = (scoring.rankBy ?? 'rung') === 'points';
  const entries = [...byReg.entries()]
    .map(([id, rows]) => ({ id, result: ladderResult(rows, scoring), name: entryName(names, def.code, id) }))
    .sort((a, b) => cmp(a.result, b.result) || a.name.display_name.localeCompare(b.name.display_name));
  const rows = placeRows(entries, (a, b) => cmp(a.result, b.result) === 0, (e, place) => ({
    place,
    registration_id: e.id,
    ...e.name,
    value: byPoints ? e.result.points : e.result.rung,
    value_label: byPoints ? `${e.result.points} pts` : `Rung ${e.result.rung} of ${scoring.tricks.length}`,
    detail: plural(e.result.attemptsUsed, 'attempt'),
  }));
  return { format: 'ladder', better: 'higher', rounds: [{ name: roundsOf(def)[0].name, rows }], final: rows };
}

function bracketStandings(def: DivisionDef, matchRows: BracketMatchRow[], names: Map<string, PublicEntry>): DivisionStandings {
  const scoring = def.scoring;
  if (scoring.format !== 'bracket') throw new Error('not a bracket');
  const matches: BracketMatch[] = matchRows.map((m) => ({
    round: m.round, position: m.position, entry_a: m.entry_a, entry_b: m.entry_b, winner: m.winner,
    is_third_place: m.is_third_place, votes_a: m.votes_a ?? null, votes_b: m.votes_b ?? null,
  }));
  const main = matches.filter((m) => !m.is_third_place);
  const totalRounds = main.length ? Math.max(...main.map((m) => m.round)) : 0;

  const reached = new Map<string, number>();
  for (const m of main) {
    for (const e of [m.entry_a, m.entry_b]) if (e) reached.set(e, Math.max(reached.get(e) ?? 0, m.round));
  }

  const placed = bracketPlacements(matches, { thirdPlaceByVotes: scoring.thirdPlaceByVotes });
  const placedIds = new Set(placed.map((p) => p.entry));
  const rows: StandingRow[] = placed.map((p) => ({
    place: p.place,
    registration_id: p.entry,
    ...entryName(names, def.code, p.entry),
    value: reached.get(p.entry) ?? 0,
    value_label: ORDINAL[p.place] ?? `${p.place}th`,
  }));

  const rest = [...reached.entries()]
    .filter(([id]) => !placedIds.has(id))
    .map(([id, r]) => ({ id, r, name: entryName(names, def.code, id) }))
    .sort((a, b) => b.r - a.r || a.name.display_name.localeCompare(b.name.display_name));
  const offset = rows.length;
  rows.push(...placeRows(rest, (a, b) => a.r === b.r, (e, place) => ({
    place: offset + place,
    registration_id: e.id,
    ...e.name,
    value: e.r,
    value_label: bracketRoundLabel(e.r, totalRounds),
  })));

  return { format: 'bracket', better: 'higher', rounds: [{ name: roundsOf(def)[0].name, rows }], final: rows };
}

function entryName(names: Map<string, PublicEntry>, division: string, id: string): PublicEntry {
  return names.get(nameKey(division, id)) ?? { display_name: 'Unnamed competitor', city: null, state: null };
}

// ---------------------------------------------------------------- public API

export function emptyDivisionStandings(def: DivisionDef): DivisionStandings {
  const f = def.scoring.format;
  return {
    format: f,
    better: betterOf(def.scoring),
    rounds: f === 'showcase' ? [] : roundsOf(def).map((r) => ({ name: r.name, rows: [] })),
    final: [],
  };
}

export function emptyStandings(divisions: DivisionDef[] = competition.divisions): Record<Division, DivisionStandings> {
  return Object.fromEntries(divisions.map((d) => [d.code, emptyDivisionStandings(d)]));
}

/** One division's standings from already-loaded rows (rows for other divisions are ignored). */
export function divisionStandings(def: DivisionDef, input: StandingsInput): DivisionStandings {
  const names = input.names ?? new Map<string, PublicEntry>();
  switch (def.scoring.format) {
    case 'freestyle':
    case 'panel':
    case 'manual':
      return scoredStandings(def, (input.results ?? []).filter((r) => r.division === def.code));
    case 'ladder':
      return ladderStandings(def, (input.ladder ?? []).filter((a) => a.division === def.code), names);
    case 'bracket':
      return bracketStandings(def, (input.matches ?? []).filter((m) => m.division === def.code), names);
    case 'showcase':
      return emptyDivisionStandings(def);
  }
}

/** Pure: standings for every division from already-loaded rows. */
export function computeStandings(input: StandingsInput, divisions: DivisionDef[] = competition.divisions): Record<Division, DivisionStandings> {
  return Object.fromEntries(divisions.map((d) => [d.code, divisionStandings(d, input)]));
}

/**
 * Who moves on from a round: the top `advance` of that round's standings (ties at the cut all go
 * through), in rank order. Empty when the round has no advance (the last round).
 */
export function roundAdvancers(def: DivisionDef, standings: DivisionStandings, fromRound: number): StandingRow[] {
  const rd = roundsOf(def)[fromRound - 1];
  const rows = standings.rounds[fromRound - 1]?.rows ?? [];
  if (!rd?.advance) return [];
  return advancers(rows, rd.advance, (r) => r.value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;

/** Public names for the ladder/bracket entrants in `ids`: team name for team captains. */
async function loadNames(supabase: AnyClient, wanted: { division: string; id: string }[]): Promise<Map<string, PublicEntry>> {
  const names = new Map<string, PublicEntry>();
  const ids = [...new Set(wanted.map((w) => w.id))];
  if (ids.length === 0) return names;
  const [{ data: regs }, { data: teams }] = await Promise.all([
    supabase.from('vsyc_registrations')
      .select('id, first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public, city, state')
      .in('id', ids),
    supabase.from('vsyc_teams').select('division, name, captain_registration_id').in('captain_registration_id', ids),
  ]);
  const regMap = new Map(((regs ?? []) as RegistrationNameRow[]).map((r) => [r.id, r]));
  const teamMap = new Map(((teams ?? []) as { division: string; name: string; captain_registration_id: string }[])
    .map((t) => [nameKey(t.division, t.captain_registration_id), t.name]));
  for (const w of wanted) {
    const reg = regMap.get(w.id);
    const key = nameKey(w.division, w.id);
    names.set(key, reg
      ? publicEntry(reg, teamMap.get(key))
      : { display_name: teamMap.get(key) ?? 'Unnamed competitor', city: null, state: null });
  }
  return names;
}

/** Load every row standings need and rank them. Missing tables or errors give empty standings. */
export async function fetchStandings(supabase: AnyClient): Promise<Record<Division, DivisionStandings>> {
  const formats = new Set(competition.divisions.map((d) => d.scoring.format));
  const scored = formats.has('freestyle') || formats.has('panel') || formats.has('manual');

  const [resultsRes, ladderRes, matchesRes] = await Promise.all([
    scored
      ? supabase.from('vsyc_results').select('registration_id, division, round, display_name, city, state, final_score')
      : Promise.resolve({ data: [], error: null }),
    formats.has('ladder')
      ? supabase.from('vsyc_ladder_attempts').select('division, registration_id, trick_index, attempt, landed')
      : Promise.resolve({ data: [], error: null }),
    formats.has('bracket')
      ? supabase.from('vsyc_bracket_matches').select('division, round, position, is_third_place, entry_a, entry_b, winner, votes_a, votes_b')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (resultsRes.error) console.error('[standings] vsyc_results:', resultsRes.error.message);
  if (ladderRes.error) console.error('[standings] vsyc_ladder_attempts:', ladderRes.error.message);
  if (matchesRes.error) console.error('[standings] vsyc_bracket_matches:', matchesRes.error.message);

  const ladder = (ladderRes.data ?? []) as LadderAttemptRow[];
  const matches = (matchesRes.data ?? []) as BracketMatchRow[];
  const wanted = [
    ...ladder.map((a) => ({ division: a.division, id: a.registration_id })),
    ...matches.flatMap((m) => [m.entry_a, m.entry_b].filter((e): e is string => !!e).map((id) => ({ division: m.division, id }))),
  ];
  const names = await loadNames(supabase, wanted);

  return computeStandings({ results: (resultsRes.data ?? []) as ResultRow[], ladder, matches, names });
}

export interface Winner {
  registration_id: string;
  display_name: string;
  division: Division;
  place: number;
}

/**
 * Places 1–PRIZE_PLACES of each judged division's overall standings (ties included), in the
 * order the public board shows. Showcase divisions have no winners. In team divisions this is
 * the captain's registration; the survey invites route adds the teammates.
 */
export function winnersFrom(standings: Record<Division, DivisionStandings>): Winner[] {
  return Object.entries(standings).flatMap(([code, s]) =>
    s.format === 'showcase'
      ? []
      : s.final.filter((r) => r.place <= PRIZE_PLACES).map((r) => ({
        registration_id: r.registration_id,
        display_name: r.display_name,
        division: code,
        place: r.place,
      })),
  );
}
