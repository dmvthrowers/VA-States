import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const BUCKET = 'vsyc26-music';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

/**
 * GET /api/player/music-url
 *
 * Lets a signed-in competitor preview the music they uploaded — scoped to
 * their own registration (auth_user_id) so nobody can peek at another
 * competitor's file. The bucket is private, so a signed URL is required.
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
    .select('music_filename')
    .eq('auth_user_id', authData.user.id)
    .single();

  if (regError || !reg) {
    return apiError('not_found', 'No linked registration found for this account', requestId);
  }
  if (!reg.music_filename) {
    return apiError('not_found', 'No music file uploaded yet', requestId);
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(reg.music_filename, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed) {
    console.error('[player/music-url] signing error:', signErr);
    return apiError('upstream_error', 'Could not generate a playback link', requestId);
  }

  return NextResponse.json(
    { filename: reg.music_filename, play_url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS },
    { headers: { 'x-request-id': requestId } }
  );
});
