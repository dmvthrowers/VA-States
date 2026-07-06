import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

const VALID_DIVISIONS = ['1A', 'X', 'SBJ'] as const;
type Division = typeof VALID_DIVISIONS[number];

/**
 * GET /api/run-order?division=1A
 *
 * Returns the performance order for a division.
 * Falls back to registration order (by created_at) if no run order has been set.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const division = req.nextUrl.searchParams.get('division') as Division | null;
  const includeMusic = req.nextUrl.searchParams.get('include_music') === '1';

  if (!division || !VALID_DIVISIONS.includes(division)) {
    return apiError('bad_request', 'division must be one of: 1A, X, SBJ', requestId);
  }

  let canViewMusic = false;
  if (includeMusic) {
    const token = getBearerToken(req);
    if (!token) {
      return apiError('unauthorized', 'Missing bearer token', requestId);
    }
    const identity = await getStaffIdentityFromToken(token);
    if (!identity || !identity.isActive) {
      return apiError('forbidden', 'Staff access required', requestId);
    }
    canViewMusic = identity.role === 'dj' || identity.role === 'audio_tech' || identity.role === 'admin';
    if (!canViewMusic) {
      return apiError('forbidden', 'DJ/audio staff access required', requestId);
    }
  }

  const supabase = createAdminClient();

  // Try explicit run order first
  const { data: runOrder, error: roError } = await supabase
    .from('vsyc_run_order')
    .select(`
      position,
      status,
      registration_id,
      vsyc_registrations (
        id,
        first_name,
        last_name,
        preferred_bracket_name,
        city,
        state,
        music_filename
      )
    `)
    .eq('division', division)
    .order('position', { ascending: true });

  if (roError) {
    console.error('[run-order] query error:', roError);
    return apiError('upstream_error', 'Failed to fetch run order', requestId);
  }

  if (runOrder && runOrder.length > 0) {
    const performers = runOrder.map((row) => {
      const reg = Array.isArray(row.vsyc_registrations)
        ? row.vsyc_registrations[0]
        : row.vsyc_registrations;
      return {
        position: row.position,
        status: row.status,
        registration_id: row.registration_id,
        display_name: reg?.preferred_bracket_name ?? `${reg?.first_name} ${reg?.last_name}`,
        city: reg?.city ?? null,
        state: reg?.state ?? null,
        music_filename: canViewMusic ? (reg?.music_filename ?? null) : null,
      };
    });

    return NextResponse.json(
      { division, source: 'run_order', performers },
      {
        headers: {
          'x-request-id': requestId,
          'Cache-Control': includeMusic ? 'private, no-store' : 'public, s-maxage=15, stale-while-revalidate=45',
        },
      }
    );
  }

  // Fallback: registration order, only paid registrants in this division
  const { data: regs, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, city, state, music_filename, created_at')
    .contains('divisions', [division])
    .eq('paid', true)
    .order('created_at', { ascending: true });

  if (regError) {
    console.error('[run-order] fallback query error:', regError);
    return apiError('upstream_error', 'Failed to fetch registrations', requestId);
  }

  const performers = (regs ?? []).map((reg, i) => ({
    position: i + 1,
    status: 'upcoming',
    registration_id: reg.id,
    display_name: reg.preferred_bracket_name ?? `${reg.first_name} ${reg.last_name}`,
    city: reg.city ?? null,
    state: reg.state ?? null,
    music_filename: canViewMusic ? (reg.music_filename ?? null) : null,
  }));

  return NextResponse.json(
    { division, source: 'registration_order', performers },
    {
      headers: {
        'x-request-id': requestId,
        'Cache-Control': includeMusic ? 'private, no-store' : 'public, s-maxage=15, stale-while-revalidate=45',
      },
    }
  );
});
