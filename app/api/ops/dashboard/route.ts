import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { fetchAllTeamMemberships, type TeamSummary } from '@/lib/team-entries';
import { competition, contest } from '@/contest.config';
import { isHomeStateEligible } from '@/lib/residency';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();

  const [registrationsRes, spectatorsRes, musicRes] = await Promise.all([
    supabase
      .from('vsyc_registrations')
      .select('id, created_at, first_name, last_name, preferred_bracket_name, email, city, state, divisions, division_styles, fee_cents, paid, paid_at, music_uploaded_at, is_public, admin_notes, registration_source, home_address, home_zip, home_state_confirmed, home_state_override')
      .order('created_at', { ascending: false }),
    supabase
      .from('vsyc_spectators')
      .select('id, created_at, first_name, last_name, nickname, email, state, team, club, is_public')
      .order('created_at', { ascending: false }),
    supabase
      .from('vsyc_music')
      .select('registration_id, division, filename, is_fallback, source, uploaded_at'),
  ]);

  if (registrationsRes.error) {
    return apiError('upstream_error', 'Failed to load contestants', requestId);
  }
  if (spectatorsRes.error) {
    return apiError('upstream_error', 'Failed to load spectators', requestId);
  }

  // Team names per registrant, merged in below. Best-effort: the dashboard still loads without it.
  let teamsByRegistration: Record<string, TeamSummary[]> = {};
  try {
    teamsByRegistration = await fetchAllTeamMemberships(supabase, competition);
  } catch (e) {
    console.error('[ops/dashboard] teams query failed:', e);
  }
  // Music is one track per division: attach each player's tracks (best-effort, like teams).
  if (musicRes.error) console.error('[ops/dashboard] music query failed:', musicRes.error);
  const musicByRegistration = new Map<string, { division: string; filename: string; is_fallback: boolean; source: string; uploaded_at: string }[]>();
  for (const m of musicRes.data ?? []) {
    const list = musicByRegistration.get(m.registration_id) ?? [];
    list.push({ division: m.division, filename: m.filename, is_fallback: m.is_fallback, source: m.source, uploaded_at: m.uploaded_at });
    musicByRegistration.set(m.registration_id, list);
  }
  const registrations = (registrationsRes.data ?? []).map((r) => ({
    ...r,
    // Eligible for the home-state champion title (home address in the champion's state, or an organizer's override)
    home_state_eligible: isHomeStateEligible(r, contest.stateChampion.state),
    teams: teamsByRegistration[r.id] ?? [],
    music: musicByRegistration.get(r.id) ?? [],
  }));
  const spectators = spectatorsRes.data ?? [];

  const stats = {
    contestants_total: registrations.length,
    contestants_paid: registrations.filter((r) => r.paid).length,
    contestants_music_uploaded: registrations.filter((r) => r.music_uploaded_at).length,
    contestants_public_profiles: registrations.filter((r) => r.is_public).length,
    spectators_total: spectators.length,
    spectators_public_profiles: spectators.filter((s) => s.is_public).length,
    revenue_cents: registrations.reduce((sum, r) => sum + Number(r.fee_cents ?? 0), 0),
  };

  const [resultsPublished, onlineRegistrationOpen] = await Promise.all([
    getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true'),
    getEventFlagBoolean('online_registration_open', true),
  ]);

  const eventFlags = {
    results_published: resultsPublished,
    online_registration_open: onlineRegistrationOpen,
  };

  return NextResponse.json(
    {
      admin: {
        auth_user_id: auth.authUserId,
        email: auth.email,
        display_name: auth.displayName,
      },
      stats,
      event_flags: eventFlags,
      contestants: registrations,
      spectators,
    },
    { headers: { 'x-request-id': requestId } }
  );
});
