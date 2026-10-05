import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { runOrderDisplayName, isNameRestricted } from '@/lib/display-name';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { isTeamDivision, roundsOf } from '@/lib/divisions-core';

type Division = string;

const REGISTRATION_FIELDS =
  'id, first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public, city, state, music_filename, division_styles';

/**
 * GET /api/run-order?division=<code>&round=<n>
 *
 * Returns the performance order for one round of a division (round defaults to 1).
 * Round 1 falls back to registration order (by created_at) if no run order has been set;
 * later rounds are empty until someone advances entrants into them. In team divisions the
 * captain's registration stands for the team and the team name is shown.
 *
 * Anonymous callers get privacy-safe names: minors who have not been opted into
 * public listing by a guardian show a handle or first name + last initial, and
 * their city/state are withheld. Authenticated staff see full legal names, so
 * any staff response is marked no-store to keep it off the shared CDN cache.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division') as Division | null;
  const includeMusic = req.nextUrl.searchParams.get('include_music') === '1';

  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const def = divisionByCode(division);
  const rounds = roundsOf(def);
  const roundParam = req.nextUrl.searchParams.get('round');
  const round = roundParam === null || roundParam === '' ? 1 : Number(roundParam);
  if (!Number.isInteger(round) || round < 1 || round > rounds.length) {
    return apiError('bad_request', `round must be 1–${rounds.length} for ${division}`, requestId);
  }
  const teamDivision = isTeamDivision(def);

  // Any active staff member may see full names; only DJ/audio/admin get music.
  let viewerIsStaff = false;
  let canViewMusic = false;

  const token = getBearerToken(req);
  if (token) {
    const identity = await getStaffIdentityFromToken(token);
    if (identity && identity.isActive) {
      viewerIsStaff = true;
      canViewMusic = identity.role === 'dj' || identity.role === 'audio_tech' || identity.role === 'admin';
    }
  }

  if (includeMusic) {
    if (!token) {
      return apiError('unauthorized', 'Missing bearer token', requestId);
    }
    if (!viewerIsStaff) {
      return apiError('forbidden', 'Staff access required', requestId);
    }
    if (!canViewMusic) {
      return apiError('forbidden', 'DJ/audio staff access required', requestId);
    }
  }

  const withMusic = includeMusic && canViewMusic;

  // A staff response carries legal names, so it must never land in a shared cache.
  const headers = {
    'x-request-id': requestId,
    'Vary': 'Authorization',
    'Cache-Control': viewerIsStaff
      ? 'private, no-store'
      : 'public, s-maxage=15, stale-while-revalidate=45',
  };

  type RegistrationRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_bracket_name: string | null;
    nickname: string | null;
    is_minor: boolean | null;
    is_public: boolean | null;
    city: string | null;
    state: string | null;
    music_filename: string | null;
    division_styles: Record<string, string[]> | null;
  };

  const toPerformer = (
    reg: RegistrationRow | null | undefined,
    position: number,
    status: string,
    registrationId: string,
    teamName?: string,
  ) => {
    // Withhold location for minors who have not been opted into public listing.
    const hideLocation = !viewerIsStaff && !!reg && isNameRestricted(reg);
    return {
      position,
      status,
      registration_id: registrationId,
      display_name: teamName || (reg ? runOrderDisplayName(reg, viewerIsStaff) : 'Unnamed competitor'),
      city: hideLocation ? null : (reg?.city ?? null),
      state: hideLocation ? null : (reg?.state ?? null),
      music_filename: withMusic ? (reg?.music_filename ?? null) : null,
      // The style(s) this competitor entered in this division, e.g. "2A, 3A".
      // Null for divisions without styles. Not sensitive.
      style: reg?.division_styles?.[division]?.join(', ') || null,
    };
  };

  const supabase = createAdminClient();

  // Team divisions: captain registration id → team name.
  const teamNames = new Map<string, string>();
  if (teamDivision) {
    const { data: teams, error: teamError } = await supabase
      .from('vsyc_teams')
      .select('name, captain_registration_id')
      .eq('division', division);
    if (teamError) {
      console.error('[run-order] teams query error:', teamError);
      return apiError('upstream_error', 'Failed to fetch teams', requestId);
    }
    for (const t of teams ?? []) teamNames.set(t.captain_registration_id, t.name);
  }

  // Try explicit run order first
  const { data: runOrder, error: roError } = await supabase
    .from('vsyc_run_order')
    .select(`
      position,
      status,
      registration_id,
      vsyc_registrations (${REGISTRATION_FIELDS})
    `)
    .eq('division', division)
    .eq('round', round)
    .order('position', { ascending: true });

  if (roError) {
    console.error('[run-order] query error:', roError);
    return apiError('upstream_error', 'Failed to fetch run order', requestId);
  }

  if (runOrder && runOrder.length > 0) {
    const performers = runOrder.map((row) => {
      const reg = (Array.isArray(row.vsyc_registrations)
        ? row.vsyc_registrations[0]
        : row.vsyc_registrations) as RegistrationRow | null;
      return toPerformer(reg, row.position, row.status, row.registration_id, teamNames.get(row.registration_id));
    });

    return NextResponse.json({ division, round, rounds: rounds.map((r) => r.name), source: 'run_order', performers }, { headers });
  }

  // Later rounds have no fallback: entrants are advanced into them.
  if (round > 1) {
    return NextResponse.json({ division, round, rounds: rounds.map((r) => r.name), source: 'run_order', performers: [] }, { headers });
  }

  // Fallback: registration order, only paid registrants in this division
  const { data: regs, error: regError } = await supabase
    .from('vsyc_registrations')
    .select(`${REGISTRATION_FIELDS}, created_at`)
    .contains('divisions', [division])
    .eq('paid', true)
    .order('created_at', { ascending: true });

  if (regError) {
    console.error('[run-order] fallback query error:', regError);
    return apiError('upstream_error', 'Failed to fetch registrations', requestId);
  }

  // In team divisions only captains stand for an entry (teammates perform with them).
  const entrants = ((regs ?? []) as RegistrationRow[]).filter((reg) => !teamDivision || teamNames.has(reg.id));
  const performers = entrants.map((reg, i) =>
    toPerformer(reg, i + 1, 'upcoming', reg.id, teamNames.get(reg.id)),
  );

  return NextResponse.json({ division, round, rounds: rounds.map((r) => r.name), source: 'registration_order', performers }, { headers });
});
