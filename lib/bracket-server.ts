/**
 * Server-side bracket helpers shared by /api/bracket and /api/admin/bracket/*: reading a
 * division's matches, privacy-safe entrant names, and saving a winner change safely.
 * Server only (uses the service-role client through its callers).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { divisionByCode, type BracketScoring, type DivisionDef } from '@/contest.config';
import { isTeamDivision, setWinner } from '@/lib/divisions-core';
import { runOrderDisplayName, isNameRestricted } from '@/lib/display-name';
import {
  changedRows, clearWinner, restrictedPublicName, syncThirdPlace, toMatches,
  type MatchPatch, type MatchRow,
} from '@/lib/bracket-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>;

export const MATCH_FIELDS =
  'id, division, round, position, is_third_place, entry_a, entry_b, winner, status, updated_at, votes_a, votes_b';

/** The division and its bracket rules, or null if it isn't a bracket division. */
export function bracketDivision(code: string | null | undefined): { def: DivisionDef; scoring: BracketScoring } | null {
  const def = code ? divisionByCode(code) : undefined;
  if (!def || def.scoring.format !== 'bracket') return null;
  return { def, scoring: def.scoring };
}

/** Every match in a division, in bracket order. */
export async function loadMatches(db: Db, division: string): Promise<{ rows: MatchRow[]; error: unknown }> {
  const { data, error } = await db
    .from('vsyc_bracket_matches')
    .select(MATCH_FIELDS)
    .eq('division', division)
    .order('is_third_place', { ascending: true })
    .order('round', { ascending: true })
    .order('position', { ascending: true });
  return { rows: (data ?? []) as MatchRow[], error };
}

/**
 * Display names for entrants. Team divisions show the team name (the captain's registration
 * stands for the team). Otherwise staff see full names; the public sees the restricted name for
 * minors not opted in (the same rule as SQL vsyc_public_name()), never a legal name.
 */
export async function entryNames(db: Db, division: string, ids: string[], viewerIsStaff: boolean): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const { data: regs } = await db
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public')
    .in('id', unique);
  for (const r of regs ?? []) {
    names.set(r.id, !viewerIsStaff && isNameRestricted(r) ? restrictedPublicName(r) : runOrderDisplayName(r, viewerIsStaff));
  }
  if (isTeamDivision(divisionByCode(division))) {
    const { data: teams } = await db
      .from('vsyc_teams')
      .select('captain_registration_id, name')
      .eq('division', division)
      .in('captain_registration_id', unique);
    for (const t of teams ?? []) names.set(t.captain_registration_id, t.name);
  }
  for (const id of unique) if (!names.has(id)) names.set(id, 'Unnamed competitor');
  return names;
}

export type WinnerResult =
  | { ok: true; changed: number; rows: MatchRow[] }
  | { ok: false; code: 'not_found' | 'conflict' | 'unprocessable' | 'upstream_error'; message: string };

/**
 * Set (or clear, with winner = null) a match result and save every match it affects.
 *
 * Concurrency: each save is `update … where id = ? and updated_at = <as read>`, and the clicked
 * match is saved first. If someone else changed it since the caller loaded the page
 * (`expectedUpdatedAt`) or since we read it, nothing is written and the caller gets a conflict.
 * If a later, downstream row changed under us (two different matches confirmed at once), we
 * re-read and re-apply; re-applying the same winner is idempotent.
 */
export async function applyWinner(
  db: Db,
  matchId: string,
  winner: string | null,
  expectedUpdatedAt?: string,
): Promise<WinnerResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: target, error: tErr } = await db.from('vsyc_bracket_matches').select(MATCH_FIELDS).eq('id', matchId).maybeSingle();
    if (tErr) return { ok: false, code: 'upstream_error', message: 'Failed to load match' };
    if (!target) return { ok: false, code: 'not_found', message: 'Match not found' };
    const { rows, error } = await loadMatches(db, (target as MatchRow).division);
    if (error) return { ok: false, code: 'upstream_error', message: 'Failed to load bracket' };

    const t = rows.find((r) => r.id === matchId)!;
    if (attempt === 0 && expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(t.updated_at).getTime()) {
      return { ok: false, code: 'conflict', message: 'This match changed since you loaded it. Check the bracket and try again.' };
    }
    // On a retry our own write to the clicked match already landed; anything else means someone overrode it.
    if (attempt > 0 && t.winner !== winner) {
      return { ok: false, code: 'conflict', message: 'Someone else changed this match at the same time. Check the bracket.' };
    }
    if (!t.entry_a || !t.entry_b) {
      return { ok: false, code: 'unprocessable', message: 'This match needs two entrants first (byes are decided automatically).' };
    }
    if (winner !== null && winner !== t.entry_a && winner !== t.entry_b) {
      return { ok: false, code: 'unprocessable', message: 'The winner must be one of the two entrants' };
    }

    const matches = toMatches(rows);
    const m = matches.find((x) => x.id === matchId)!;
    if (winner === null) clearWinner(matches, m);
    else if (m.winner !== winner) {
      setWinner(matches, m, winner);
      syncThirdPlace(matches);
    }
    const patches = changedRows(rows, matches, matchId);
    const saved = await savePatches(db, patches, matchId);
    if (saved === 'ok') {
      const fresh = await loadMatches(db, t.division);
      return { ok: true, changed: patches.length, rows: fresh.rows };
    }
    if (saved === 'target_conflict') {
      return { ok: false, code: 'conflict', message: 'Someone else changed this match at the same time. Check the bracket.' };
    }
    if (saved === 'error') return { ok: false, code: 'upstream_error', message: 'Failed to save the bracket' };
    // 'downstream_conflict': re-read and re-apply.
  }
  return { ok: false, code: 'conflict', message: 'The bracket kept changing while saving. Reload and check it.' };
}

async function savePatches(db: Db, patches: MatchPatch[], targetId: string): Promise<'ok' | 'target_conflict' | 'downstream_conflict' | 'error'> {
  for (const p of patches) {
    const { data, error } = await db
      .from('vsyc_bracket_matches')
      .update(p.set)
      .eq('id', p.id)
      .eq('updated_at', p.updated_at)
      .select('id');
    if (error) return 'error';
    if (!data || data.length === 0) return p.id === targetId ? 'target_conflict' : 'downstream_conflict';
    // Judge votes were for the old pairing.
    if (p.entrantsChanged && p.id !== targetId) {
      await db.from('vsyc_battle_votes').delete().eq('match_id', p.id);
    }
  }
  return 'ok';
}
