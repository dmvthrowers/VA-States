import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { resolveSlot } from '@/lib/music-config';

export const runtime = 'nodejs';

const BUCKET = 'vsyc26-music';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — just long enough to load/download

/**
 * GET /api/dj/music-url?registration_id=...&division=1A&slot=prelims
 *
 * Mints a short-lived signed URL for one of a performer's tracks (one per division and slot; the
 * run order says which slot a round plays, as `music_slot`) so DJ/audio staff can stream it in-browser or download a local copy.
 * The bucket is private, so this is the only way to reach the file. `is_fallback` is true when
 * the player never uploaded and a lo-fi track was assigned.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive) {
    return apiError('forbidden', 'Staff access required', requestId);
  }
  if (!['dj', 'audio_tech', 'admin'].includes(identity.role)) {
    return apiError('forbidden', 'DJ/audio staff access required', requestId);
  }

  const registrationId = req.nextUrl.searchParams.get('registration_id');
  if (!registrationId) {
    return apiError('bad_request', 'registration_id is required', requestId);
  }

  const supabase = createAdminClient();

  const division = req.nextUrl.searchParams.get('division');
  const slot = resolveSlot(division ?? '', req.nextUrl.searchParams.get('slot'));
  if (!division || !slot) {
    return apiError('bad_request', 'division and slot are required (slot may be left out when the division has one track)', requestId);
  }

  const { data: track, error: trackError } = await supabase
    .from('vsyc_music')
    .select('object_name, filename, is_fallback')
    .eq('registration_id', registrationId)
    .eq('division', division)
    .eq('slot', slot)
    .maybeSingle();

  if (trackError) {
    console.error('[dj/music-url] lookup error:', trackError);
    return apiError('upstream_error', 'Failed to look up the track', requestId);
  }
  if (!track) {
    return apiError('not_found', `No music file for this performer in ${division} (${slot})`, requestId);
  }

  const [playResult, downloadResult] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(track.object_name, SIGNED_URL_TTL_SECONDS),
    supabase.storage.from(BUCKET).createSignedUrl(track.object_name, SIGNED_URL_TTL_SECONDS, {
      download: track.filename,
    }),
  ]);

  if (playResult.error || !playResult.data || downloadResult.error || !downloadResult.data) {
    console.error('[dj/music-url] signing error:', playResult.error, downloadResult.error);
    return apiError('upstream_error', 'Could not generate a playback link', requestId);
  }

  return NextResponse.json(
    {
      division,
      slot,
      filename: track.filename,
      is_fallback: track.is_fallback,
      play_url: playResult.data.signedUrl,
      download_url: downloadResult.data.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    },
    { headers: { 'x-request-id': requestId } }
  );
});
