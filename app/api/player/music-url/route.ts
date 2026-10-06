import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const BUCKET = 'vsyc26-music';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

/**
 * GET /api/player/music-url?division=1A&slot=prelims
 *
 * Lets a signed-in competitor preview one of their tracks (one per division and slot) — scoped to their own registration (auth_user_id) so nobody can peek at another
 * competitor's file. The bucket is private, so a signed URL is required. `division` and `slot` may
 * be left out when the player has exactly one track.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return apiError('unauthorized', 'Missing bearer token', requestId);
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const supabase = createAdminClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData.user) {
    return apiError('unauthorized', 'Invalid session token', requestId);
  }

  const { data: reg, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .single();

  if (regError || !reg) {
    return apiError('not_found', 'No linked registration found for this account', requestId);
  }

  const division = req.nextUrl.searchParams.get('division');
  let query = supabase
    .from('vsyc_music')
    .select('division, slot, object_name, filename, is_fallback')
    .eq('registration_id', reg.id);
  if (division) query = query.eq('division', division);
  const slot = req.nextUrl.searchParams.get('slot');
  if (slot) query = query.eq('slot', slot);
  const { data: tracks, error: trackError } = await query;
  if (trackError) {
    console.error('[player/music-url] lookup error:', trackError);
    return apiError('upstream_error', 'Failed to look up your music', requestId);
  }
  if (!tracks?.length) {
    return apiError('not_found', division ? `No music uploaded yet for ${division}${slot ? ` ${slot}` : ''}` : 'No music uploaded yet', requestId);
  }
  if (tracks.length > 1) {
    return apiError('bad_request', 'division and slot are required: you have more than one track', requestId);
  }
  const track = tracks[0];

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(track.object_name, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed) {
    console.error('[player/music-url] signing error:', signErr);
    return apiError('upstream_error', 'Could not generate a playback link', requestId);
  }

  return NextResponse.json(
    { division: track.division, slot: track.slot, filename: track.filename, is_fallback: track.is_fallback, play_url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS },
    { headers: { 'x-request-id': requestId } }
  );
});
