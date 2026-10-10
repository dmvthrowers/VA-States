/**
 * Database-independent bracket plumbing for the battle routes: turning `buildBracket` output
 * into `vsyc_bracket_matches` rows, rows back into `BracketMatch` objects, clearing a
 * winner, keeping the third-place match in step with the semifinals, and working out which
 * rows changed. The bracket rules themselves live in lib/divisions-core.ts.
 *
 * Only type imports from ./divisions-core so `npm test` can load this file under plain Node
 * (tests pass `setWinner` / `buildBracket` in from divisions-core themselves).
 */
import type { BracketMatch } from './divisions-core';

export type MatchStatus = 'pending' | 'live' | 'done';

/** A vsyc_bracket_matches row as the routes read it. */
export interface MatchRow {
  id: string;
  division: string;
  round: number;
  position: number;
  is_third_place: boolean;
  entry_a: string | null;
  entry_b: string | null;
  winner: string | null;
  status: MatchStatus;
  updated_at: string;
  /** Audience poll counts (migration 0040), null until entered */
  votes_a?: number | null;
  votes_b?: number | null;
  /** Running match score (migration 0058), null until entered; only divisions with matchScoring use it */
  score_a?: number | null;
  score_b?: number | null;
}

/** A row to insert (the database fills in id and updated_at). */
export type NewMatchRow = Omit<MatchRow, 'id' | 'updated_at'>;

/** A BracketMatch that remembers which row it came from. */
export interface StoredMatch extends BracketMatch {
  id: string;
  status: MatchStatus;
  updated_at: string;
  score_a?: number | null;
  score_b?: number | null;
}

/** The columns a winner change can touch. */
export interface MatchPatch {
  id: string;
  /** updated_at as read, for an optimistic-concurrency check on save */
  updated_at: string;
  set: Partial<Pick<MatchRow, 'entry_a' | 'entry_b' | 'winner' | 'status' | 'votes_a' | 'votes_b' | 'score_a' | 'score_b'>>;
  /** The entrants changed, so votes cast on this match are about different people now. */
  entrantsChanged: boolean;
}

/** Is this a bye: exactly one entrant, so the winner is automatic? */
export const isBye = (m: Pick<BracketMatch, 'entry_a' | 'entry_b'>) => (m.entry_a === null) !== (m.entry_b === null);

/** Has a match been decided by the judges (not a bye)? */
export const hasRealWinner = (m: Pick<BracketMatch, 'entry_a' | 'entry_b' | 'winner'>) =>
  m.winner !== null && m.entry_a !== null && m.entry_b !== null;

/** Rows to insert for a freshly built bracket. Byes are already decided, so they're 'done'. */
export function bracketRows(division: string, matches: BracketMatch[]): NewMatchRow[] {
  return matches.map((m) => ({
    division,
    round: m.round,
    position: m.position,
    is_third_place: m.is_third_place,
    entry_a: m.entry_a,
    entry_b: m.entry_b,
    winner: m.winner,
    status: m.winner ? 'done' : 'pending',
  }));
}

/** Rows from the database → mutable BracketMatch objects (copies, so the rows stay as read). */
export function toMatches(rows: MatchRow[]): StoredMatch[] {
  return rows.map((r) => ({
    id: r.id,
    round: Number(r.round),
    position: Number(r.position),
    is_third_place: Boolean(r.is_third_place),
    entry_a: r.entry_a ?? null,
    entry_b: r.entry_b ?? null,
    winner: r.winner ?? null,
    status: r.status,
    updated_at: r.updated_at,
    votes_a: r.votes_a ?? null,
    votes_b: r.votes_b ?? null,
    score_a: r.score_a ?? null,
    score_b: r.score_b ?? null,
  }));
}

/** The number of main-bracket rounds (the final's round), or 0 with no matches. */
export function mainRounds(matches: Pick<BracketMatch, 'round' | 'is_third_place'>[]): number {
  const main = matches.filter((m) => !m.is_third_place);
  return main.length ? Math.max(...main.map((m) => m.round)) : 0;
}

const find = <T extends BracketMatch>(ms: T[], round: number, position: number, third = false) =>
  ms.find((m) => m.round === round && m.position === position && m.is_third_place === third);

/**
 * Make the third-place match agree with the semifinals: each slot holds that semifinal's loser,
 * or nothing while the semifinal is undecided. A slot that changes voids the third-place result.
 * (setWinner fills the slot when a semifinal is decided, but a winner cleared further up the
 * bracket can leave a stale loser behind; this tidies that up.)
 */
export function syncThirdPlace(matches: BracketMatch[]): void {
  const rounds = mainRounds(matches);
  const third = find(matches, rounds, 2, true);
  if (!third || rounds < 2) return;
  for (const semi of matches.filter((m) => !m.is_third_place && m.round === rounds - 1)) {
    const slot = semi.position % 2 === 1 ? 'entry_a' : 'entry_b';
    const loser = semi.winner === null ? null : semi.winner === semi.entry_a ? semi.entry_b : semi.entry_a;
    if (third[slot] !== loser) {
      third[slot] = loser;
      third.winner = null;
    }
  }
}

/**
 * Undo a match result: clear its winner and take that winner back out of every later match it
 * had been carried into (clearing those results too).
 */
export function clearWinner(matches: BracketMatch[], match: BracketMatch): void {
  const old = match.winner;
  match.winner = null;
  if (old === null || match.is_third_place) return;
  const rounds = mainRounds(matches);
  let cur = match;
  let carried: string | null = old;
  while (carried !== null && cur.round < rounds) {
    const next = find(matches, cur.round + 1, Math.ceil(cur.position / 2));
    if (!next) break;
    const slot = cur.position % 2 === 1 ? 'entry_a' : 'entry_b';
    if (next[slot] !== carried) break;
    next[slot] = null;
    carried = next.winner;
    next.winner = null;
    cur = next;
  }
  syncThirdPlace(matches);
}

/**
 * Compare matches after setWinner / clearWinner with the rows as read, and return what to save.
 * `targetId` is the match whose result was set (or cleared): it becomes 'done' (or 'pending').
 * Any other match that loses its result goes back to 'pending'. A match whose entrants change
 * also loses its audience poll counts and match score.
 */
export function changedRows(before: MatchRow[], after: StoredMatch[], targetId: string): MatchPatch[] {
  const prev = new Map(before.map((r) => [r.id, r]));
  const out: MatchPatch[] = [];
  for (const m of after) {
    const r = prev.get(m.id);
    if (!r) continue;
    const set: MatchPatch['set'] = {};
    if ((r.entry_a ?? null) !== m.entry_a) set.entry_a = m.entry_a;
    if ((r.entry_b ?? null) !== m.entry_b) set.entry_b = m.entry_b;
    if ((r.winner ?? null) !== m.winner) set.winner = m.winner;
    let status: MatchStatus = r.status;
    if (m.id === targetId) status = m.winner ? 'done' : r.status === 'done' ? 'pending' : r.status;
    else if (m.winner === null && r.status === 'done') status = 'pending';
    if (status !== r.status) set.status = status;
    const entrantsChanged = 'entry_a' in set || 'entry_b' in set;
    // A poll count was about the old pairing.
    if (entrantsChanged && (r.votes_a ?? null) !== null) set.votes_a = null;
    if (entrantsChanged && (r.votes_b ?? null) !== null) set.votes_b = null;
    // So was a match score.
    if (entrantsChanged && (r.score_a ?? null) !== null) set.score_a = null;
    if (entrantsChanged && (r.score_b ?? null) !== null) set.score_b = null;
    if (Object.keys(set).length === 0) continue;
    out.push({
      id: m.id,
      updated_at: r.updated_at,
      set,
      entrantsChanged,
    });
  }
  // Save the match that was clicked first: if someone else changed it meanwhile, nothing else is written.
  return out.sort((a, b) => (a.id === targetId ? -1 : b.id === targetId ? 1 : 0));
}

/** Uniform random integer in [0, n) from crypto.getRandomValues (rejection sampling, no modulo bias). */
export function secureRandomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('n must be an integer in 1..2^32');
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Fisher–Yates shuffle (a copy). `randomInt(n)` must return an integer in [0, n). */
export function secureShuffle<T>(items: T[], randomInt: (n: number) => number = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface EntrantCandidate {
  registration_id: string;
  created_at: string;
}

/**
 * Seed order for a new bracket (best seed first): registration order, or a secure random draw.
 */
export function seedEntrants(
  candidates: EntrantCandidate[],
  seeding: 'random' | 'registration',
  randomInt?: (n: number) => number,
): string[] {
  const byReg = [...candidates].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.registration_id < b.registration_id ? -1 : 1);
  const ids = [...new Set(byReg.map((c) => c.registration_id))];
  return seeding === 'registration' ? ids : secureShuffle(ids, randomInt);
}

/**
 * Exactly one live match per division: given the live rows after a "set live", keep the most
 * recently updated (ties by id, so concurrent callers agree) and return the ids to demote.
 */
export function extraLiveMatches(live: Pick<MatchRow, 'id' | 'updated_at'>[]): { keep: string | null; demote: string[] } {
  if (live.length === 0) return { keep: null, demote: [] };
  const sorted = [...live].sort((a, b) =>
    a.updated_at > b.updated_at ? -1 : a.updated_at < b.updated_at ? 1 : a.id > b.id ? -1 : 1);
  return { keep: sorted[0].id, demote: sorted.slice(1).map((r) => r.id) };
}

/** Name fields used for public display. */
export interface PublicNameParts {
  first_name?: string | null;
  last_name?: string | null;
  preferred_bracket_name?: string | null;
  nickname?: string | null;
  is_minor?: boolean | null;
  is_public?: boolean | null;
}

/**
 * The public name rule from SQL `vsyc_public_name()` (migration 0039): a minor not opted
 * into public listing gets a nickname, a bracket name that isn't their legal name, or first
 * name + last initial. Never their full legal name.
 */
export function restrictedPublicName(r: PublicNameParts): string {
  const first = (r.first_name ?? '').trim();
  const last = (r.last_name ?? '').trim();
  const nick = (r.nickname ?? '').trim();
  if (nick) return nick;
  const bracket = (r.preferred_bracket_name ?? '').trim();
  if (bracket && bracket.toLowerCase() !== `${first} ${last}`.trim().toLowerCase()) return bracket;
  if (first && last) return `${first} ${last.charAt(0)}.`;
  return first || 'Junior competitor';
}
