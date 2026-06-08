import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withErrorHandling, apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// POST /api/admin/music-upload
// Body: { registration_id: string, filename: string }
// Returns: { upload_url: string, path: string, token: string }
//
// Supabase Storage bucket "vsyc-music" must exist (create in dashboard, set private).
// Client uploads directly to the signed URL via PUT, then this record is done.

export const POST = withErrorHandling(async (requestId: string, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const { registration_id, filename } = body as { registration_id?: string; filename?: string };

  if (!registration_id || !filename) {
    return apiError('bad_request', 'registration_id and filename are required.', requestId);
  }

  const safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/\.+/g, '.').slice(0, 120);
  const path = `${registration_id}/${Date.now()}_${safe}`;

  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from('vsyc-music')
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[music-upload] storage error:', error);
    return apiError(
      'upstream_error',
      error?.message ?? 'Could not generate upload URL. Ensure the vsyc-music bucket exists.',
      requestId,
    );
  }

  // Optimistically update music_filename on registration
  await supabase
    .from('vsyc_registrations')
    .update({ music_filename: safe })
    .eq('id', registration_id);

  return NextResponse.json({ upload_url: data.signedUrl, path, token: data.token });
});

// PATCH /api/admin/music-upload
// Body: { registration_id: string, filename: string }
// Called after upload completes to confirm music_filename (optional — POST already sets it)

export const PATCH = withErrorHandling(async (requestId: string, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const { registration_id, filename } = body as { registration_id?: string; filename?: string };

  if (!registration_id || !filename) {
    return apiError('bad_request', 'registration_id and filename are required.', requestId);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_registrations')
    .update({ music_filename: filename })
    .eq('id', registration_id);

  if (error) return apiError('upstream_error', error.message, requestId);
  return NextResponse.json({ ok: true });
});
