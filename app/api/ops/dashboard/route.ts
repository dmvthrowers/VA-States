import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';

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

  const [registrationsRes, spectatorsRes] = await Promise.all([
    supabase
      .from('vsyc_registrations')
      .select('id, created_at, first_name, last_name, preferred_bracket_name, email, city, state, divisions, x_substyle, fee_cents, paid, paid_at, music_filename, music_uploaded_at, is_public, admin_notes, registration_source')
      .order('created_at', { ascending: false }),
    supabase
      .from('vsyc_spectators')
      .select('id, created_at, first_name, last_name, nickname, email, state, team, club, is_public')
      .order('created_at', { ascending: false }),
  ]);

  if (registrationsRes.error) {
    return apiError('upstream_error', 'Failed to load contestants', requestId);
  }
  if (spectatorsRes.error) {
    return apiError('upstream_error', 'Failed to load spectators', requestId);
  }

  const registrations = registrationsRes.data ?? [];
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

  const eventFlags = {
    results_published: await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true'),
    online_registration_open: await getEventFlagBoolean('online_registration_open', true),
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
