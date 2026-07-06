import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

export const runtime = 'nodejs';

const BUCKET = 'vsyc26-music';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — just long enough to load/download

/**
 * GET /api/dj/music-url?registration_id=...
 *
 * Mints a short-lived signed URL for a performer's uploaded music file so
 * DJ/audio staff can stream it in-browser or download a local copy.
 * The bucket is private, so this is the only way to reach the file.
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

  const { data: reg, error: regError } = await supabase
    .from('vsyc_registrations')
    .select('music_filename')
    .eq('id', registrationId)
    .maybeSingle();

  if (regError) {
    console.error('[dj/music-url] lookup error:', regError);
    return apiError('upstream_error', 'Failed to look up registration', requestId);
  }
  if (!reg?.music_filename) {
    return apiError('not_found', 'No music file uploaded for this performer', requestId);
  }

  const [playResult, downloadResult] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(reg.music_filename, SIGNED_URL_TTL_SECONDS),
    supabase.storage.from(BUCKET).createSignedUrl(reg.music_filename, SIGNED_URL_TTL_SECONDS, {
      download: reg.music_filename,
    }),
  ]);

  if (playResult.error || !playResult.data || downloadResult.error || !downloadResult.data) {
    console.error('[dj/music-url] signing error:', playResult.error, downloadResult.error);
    return apiError('upstream_error', 'Could not generate a playback link', requestId);
  }

  return NextResponse.json(
    {
      filename: reg.music_filename,
      play_url: playResult.data.signedUrl,
      download_url: downloadResult.data.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    },
    { headers: { 'x-request-id': requestId } }
  );
});
