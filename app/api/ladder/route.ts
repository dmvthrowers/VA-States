import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken, type StaffIdentity } from '@/lib/auth/staff';
import { isPublished, publishedDivisions } from '@/lib/results-visibility';
import { runOrderDisplayName, type DisplayNameParts } from '@/lib/display-name';
import { DIVISION_CODES, divisionByCode, type DivisionDef, type LadderScoring } from '@/contest.config';
import { compareLadder, isTeamDivision, ladderNext, ladderResult, type LadderAttempt, type LadderResult } from '@/lib/divisions-core';

/**
 * Trick ladders (format "ladder", see docs/FORMATS.md).
 *
 *  GET    /api/ladder?division=CODE  → { division, tricks, attemptsPerTrick, entries }
 *         Public once results are published; staff can always see it (full names).
 *  POST   /api/ladder (judge/admin)  { division, registration_id, trick_index, attempt, landed }
 *         upserts one attempt.
 *  DELETE /api/ladder (judge/admin)  { division, registration_id, trick_index, attempt } — undo.
 *
 * POST and DELETE answer with the entrant's updated entry so the judge's sheet can reconcile.
 * The vsyc_ladder_attempts trigger re-checks trick_index / attempt against the division config.
 */

const REGISTRATION_FIELDS = 'id, first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public';

type RegistrationRow = DisplayNameParts & { id: string };

interface LadderAttemptRow extends LadderAttempt {
  created_at: string;
}

interface LadderEntry {
  registration_id: string;
  display_name: string;
  attempts: LadderAttemptRow[];
  result: LadderResult;
}

const divisionField = z.string().trim().max(20).refine((d) => DIVISION_CODES.includes(d), 'Unknown division');
const attemptKey = {
  division:        divisionField,
  registration_id: z.string().uuid(),
  trick_index:     z.number().int().min(0).max(999),
  attempt:         z.number().int().min(1).max(99),
};
const postSchema = z.object({ ...attemptKey, landed: z.boolean() });
const deleteSchema = z.object(attemptKey);

/** The division's ladder config, or null when the division isn't a ladder. */
function ladderOf(code: string): { d: DivisionDef; sc: LadderScoring } | null {
  const d = divisionByCode(code);
  return d && d.scoring.format === 'ladder' ? { d, sc: d.scoring } : null;
}

const isWriter = (id: StaffIdentity | null) => !!id && id.isActive && (id.role === 'judge' || id.role === 'admin');

type Admin = ReturnType<typeof createAdminClient>;

/** Team ladders: only captains' registrations stand for the team. Returns captain id → team name. */
async function teamNames(supabase: Admin, division: string): Promise<Map<string, string> | null> {
  if (!isTeamDivision(divisionByCode(division))) return null;
  const { data, error } = await supabase
    .from('vsyc_teams')
    .select('name, captain_registration_id')
    .eq('division', division);
  if (error) throw error;
  return new Map((data ?? []).map((t) => [t.captain_registration_id as string, t.name as string]));
}

type AttemptDbRow = LadderAttemptRow & { registration_id: string };

async function attemptsFor(supabase: Admin, division: string, registrationId?: string): Promise<AttemptDbRow[]> {
  const q = supabase
    .from('vsyc_ladder_attempts')
    .select('registration_id, trick_index, attempt, landed, created_at')
    .eq('division', division);
  if (registrationId) q.eq('registration_id', registrationId);
  const { data, error } = await q.order('trick_index', { ascending: true }).order('attempt', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AttemptDbRow[];
}

const toAttempt = (r: { trick_index: number; attempt: number; landed: boolean; created_at: string }): LadderAttemptRow => ({
  trick_index: Number(r.trick_index), attempt: Number(r.attempt), landed: Boolean(r.landed), created_at: r.created_at,
});

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division') ?? '';
  const ladder = ladderOf(division);
  if (!DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  if (!ladder) return apiError('bad_request', `${division} is not a trick ladder`, requestId);
  const { sc } = ladder;

  const token = getBearerToken(req);
  const identity = token ? await getStaffIdentityFromToken(token) : null;
  const viewerIsStaff = !!identity && identity.isActive;
  if (token && !viewerIsStaff) return apiError('forbidden', 'Staff access required', requestId);

  const base = { division, tricks: sc.tricks, attemptsPerTrick: sc.attemptsPerTrick, rankBy: sc.rankBy ?? 'rung' };

  if (!viewerIsStaff) {
    const published = isPublished(await publishedDivisions(createAdminClient()), division);
    if (!published) {
      return NextResponse.json(
        { ...base, published: false, entries: [] },
        { headers: { 'x-request-id': requestId, 'Vary': 'Authorization', 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45' } },
      );
    }
  }

  const supabase = createAdminClient();
  const { data: regs, error: regError } = await supabase
    .from('vsyc_registrations')
    .select(REGISTRATION_FIELDS)
    .contains('divisions', [division])
    .eq('paid', true)
    .order('created_at', { ascending: true });
  if (regError) {
    console.error('[ladder] registrations query error:', regError);
    return apiError('upstream_error', 'Failed to fetch entrants', requestId);
  }

  let teams: Map<string, string> | null;
  let rows: AttemptDbRow[];
  try {
    [teams, rows] = await Promise.all([teamNames(supabase, division), attemptsFor(supabase, division)]);
  } catch (e) {
    console.error('[ladder] query error:', e);
    return apiError('upstream_error', 'Failed to fetch ladder attempts', requestId);
  }

  const byReg = new Map<string, LadderAttemptRow[]>();
  for (const r of rows) {
    const id = r.registration_id;
    if (!byReg.has(id)) byReg.set(id, []);
    byReg.get(id)!.push(toAttempt(r));
  }

  const cmp = compareLadder(sc);
  const entries: LadderEntry[] = ((regs ?? []) as RegistrationRow[])
    .filter((reg) => !teams || teams.has(reg.id))
    .map((reg) => {
      const attempts = byReg.get(reg.id) ?? [];
      return {
        registration_id: reg.id,
        display_name: teams?.get(reg.id) ?? runOrderDisplayName(reg, viewerIsStaff),
        attempts,
        result: ladderResult(attempts, sc),
      };
    })
    .sort((a, b) => cmp(a.result, b.result));

  return NextResponse.json(
    { ...base, published: true, entries },
    {
      headers: {
        'x-request-id': requestId,
        'Vary': 'Authorization',
        'Cache-Control': viewerIsStaff ? 'private, no-store' : 'public, s-maxage=15, stale-while-revalidate=45',
      },
    },
  );
});

/** Shared checks for POST and DELETE: judge/admin, ladder division, paid entrant (team captain). */
async function authorizeWrite(requestId: string, req: NextRequest, division: string, registrationId: string) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, error: apiError('unauthorized', 'Missing bearer token', requestId) };
  const identity = await getStaffIdentityFromToken(token);
  if (!isWriter(identity)) return { ok: false as const, error: apiError('forbidden', 'Judge access required', requestId) };

  const ladder = ladderOf(division);
  if (!ladder) return { ok: false as const, error: apiError('unprocessable', `${division} is not a trick ladder`, requestId) };

  const supabase = createAdminClient();
  const { data: reg, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('id, divisions, paid')
    .eq('id', registrationId)
    .maybeSingle();
  if (regError) {
    console.error('[ladder] registration query error:', regError);
    return { ok: false as const, error: apiError('upstream_error', 'Failed to look up the competitor', requestId) };
  }
  if (!reg) return { ok: false as const, error: apiError('not_found', 'Registration not found', requestId) };
  if (!((reg.divisions as string[]) ?? []).includes(division)) {
    return { ok: false as const, error: apiError('unprocessable', 'Competitor is not in this division', requestId) };
  }
  if (!reg.paid) return { ok: false as const, error: apiError('unprocessable', 'Competitor has not paid', requestId) };
  try {
    const teams = await teamNames(supabase, division);
    if (teams && !teams.has(registrationId)) {
      return { ok: false as const, error: apiError('unprocessable', "The team captain's entry stands for the team", requestId) };
    }
  } catch (e) {
    console.error('[ladder] teams query error:', e);
    return { ok: false as const, error: apiError('upstream_error', 'Failed to look up the team', requestId) };
  }

  return { ok: true as const, identity: identity!, supabase, sc: ladder.sc };
}

async function entryResponse(requestId: string, supabase: Admin, division: string, registrationId: string, sc: LadderScoring) {
  const attempts = (await attemptsFor(supabase, division, registrationId)).map(toAttempt);
  return NextResponse.json(
    { division, registration_id: registrationId, attempts, result: ladderResult(attempts, sc) },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
}

const isCheckViolation = (e: { code?: string } | null) => e?.code === '23514';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { division, registration_id, trick_index, attempt, landed } = parsed.data;

  const auth = await authorizeWrite(requestId, req, division, registration_id);
  if (!auth.ok) return auth.error;
  const { identity, supabase, sc } = auth;

  if (trick_index >= sc.tricks.length) {
    return apiError('unprocessable', `This ladder has ${sc.tricks.length} tricks`, requestId);
  }
  if (attempt > sc.attemptsPerTrick) {
    return apiError('unprocessable', `${sc.attemptsPerTrick} attempts per trick`, requestId);
  }

  let existing: LadderAttemptRow[];
  try {
    existing = (await attemptsFor(supabase, division, registration_id)).map(toAttempt);
  } catch (e) {
    console.error('[ladder] attempts query error:', e);
    return apiError('upstream_error', 'Failed to fetch ladder attempts', requestId);
  }

  // A re-record of an existing attempt is always allowed (fixing a mistake). A new attempt must be
  // the next one: in rung mode ladderNext's trick and attempt; in points mode the next try at that trick.
  const isRerecord = existing.some((r) => r.trick_index === trick_index && r.attempt === attempt);
  if (!isRerecord) {
    if ((sc.rankBy ?? 'rung') === 'rung') {
      const next = ladderNext(ladderResult(existing, sc), existing, sc);
      if (!next) return apiError('conflict', 'This competitor has finished the ladder', requestId);
      if (next.trick_index !== trick_index || next.attempt !== attempt) {
        return apiError('conflict', `Next up is "${sc.tricks[next.trick_index].name}", attempt ${next.attempt}`, requestId);
      }
    } else {
      const tries = existing.filter((r) => r.trick_index === trick_index);
      if (tries.some((r) => r.landed)) return apiError('conflict', 'That trick is already landed', requestId);
      const used = Math.max(0, ...tries.map((r) => r.attempt));
      if (attempt !== used + 1) return apiError('conflict', `Next try at that trick is attempt ${used + 1}`, requestId);
    }
  }

  const { error: upsertError } = await supabase
    .from('vsyc_ladder_attempts')
    .upsert(
      { division, registration_id, trick_index, attempt, landed, judge_user_id: identity.authUserId, judge_name: identity.displayName },
      { onConflict: 'division,registration_id,trick_index,attempt' },
    );
  if (upsertError) {
    if (isCheckViolation(upsertError)) return apiError('unprocessable', upsertError.message, requestId);
    console.error('[ladder] upsert error:', upsertError);
    return apiError('upstream_error', 'Failed to save the attempt', requestId);
  }

  return entryResponse(requestId, supabase, division, registration_id, sc);
});

export const DELETE = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { division, registration_id, trick_index, attempt } = parsed.data;

  const auth = await authorizeWrite(requestId, req, division, registration_id);
  if (!auth.ok) return auth.error;
  const { supabase, sc } = auth;

  const { data: deleted, error: deleteError } = await supabase
    .from('vsyc_ladder_attempts')
    .delete()
    .eq('division', division)
    .eq('registration_id', registration_id)
    .eq('trick_index', trick_index)
    .eq('attempt', attempt)
    .select('id');
  if (deleteError) {
    console.error('[ladder] delete error:', deleteError);
    return apiError('upstream_error', 'Failed to undo the attempt', requestId);
  }
  if (!deleted || deleted.length === 0) return apiError('not_found', 'No such attempt', requestId);

  return entryResponse(requestId, supabase, division, registration_id, sc);
});
