import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { buildMusicFilename } from '@/lib/filename';
import { logAudit } from '@/lib/audit';
import { divisionByCode } from '@/contest.config';
import { musicDivisions, needsReplaceConfirm, staleObjectToRemove, type MusicTrack } from '@/lib/music';

export const runtime = 'nodejs';

const BUCKET = 'vsyc26-music';

/**
 * Staff upload of a performer's track for ONE division (players have one track per division).
 * Same two-step flow as the player upload, and the file is named DIVISION_Last_First.ext.
 *
 *   POST  { registration_id, division, filename, replace? }
 *         → { upload_url, path, token, filename, division }
 *         Refused (409) when the slot already holds the player's own track, unless replace: true.
 *   (client PUTs the file to upload_url)
 *   PATCH { registration_id, division, filename }
 *         → verifies the file landed, records it for that division, audit-logs it.
 *
 * Uses the private "vsyc26-music" bucket created by 0002_storage_buckets.sql.
 */

async function loadTarget(registrationId: string | undefined, division: string | undefined, requestId: string) {
  if (!registrationId || !division) {
    return { ok: false as const, res: apiError('bad_request', 'registration_id and division are required.', requestId) };
  }
  const supabase = createAdminClient();
  const { data: reg, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) return { ok: false as const, res: apiError('upstream_error', 'Could not look up the registration.', requestId) };
  if (!reg) return { ok: false as const, res: apiError('not_found', 'Registration not found.', requestId) };
  const allowed = musicDivisions(reg.divisions as string[], (c) => divisionByCode(c)?.music === true);
  if (!allowed.includes(division)) {
    return { ok: false as const, res: apiError('bad_request', `${division} is not a music division for this player.`, requestId) };
  }
  const { data: existing } = await supabase
    .from('vsyc_music')
    .select('division, object_name, filename, source, is_fallback, uploaded_at')
    .eq('registration_id', reg.id)
    .eq('division', division)
    .maybeSingle();
  return { ok: true as const, supabase, reg, previous: (existing ?? null) as MusicTrack | null };
}

export const POST = withErrorHandling(async (requestId: string, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { registration_id, division, filename, replace } = body as {
    registration_id?: string; division?: string; filename?: string; replace?: boolean;
  };
  if (!filename) return apiError('bad_request', 'filename is required.', requestId);

  const target = await loadTarget(registration_id, division, requestId);
  if (!target.ok) return target.res;
  const { supabase, reg, previous } = target;

  if (needsReplaceConfirm(previous) && replace !== true) {
    return apiError('conflict', `${division} already has a track (${previous!.filename}). Confirm to replace it.`, requestId);
  }

  const built = buildMusicFilename(division!, reg.last_name, reg.first_name, filename);
  if (built.error) return apiError('unprocessable', built.error, requestId);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(built.filename, { upsert: true });

  if (error || !data) {
    console.error('[music-upload] storage error:', error);
    return apiError(
      'upstream_error',
      error?.message ?? 'Could not generate upload URL. Ensure the vsyc26-music bucket exists.',
      requestId,
    );
  }

  return NextResponse.json({ upload_url: data.signedUrl, path: data.path, token: data.token, filename: built.filename, division });
});

export const PATCH = withErrorHandling(async (requestId: string, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { registration_id, division, filename } = body as {
    registration_id?: string; division?: string; filename?: string;
  };
  if (!filename) return apiError('bad_request', 'filename is required.', requestId);

  const target = await loadTarget(registration_id, division, requestId);
  if (!target.ok) return target.res;
  const { supabase, reg, previous } = target;

  // Only the file name POST handed out for this player and division is accepted.
  const { filename: canonical } = buildMusicFilename(division!, reg.last_name, reg.first_name, 'x.mp3');
  if (!filename.startsWith(`${canonical.replace(/\.mp3$/, '')}.`) || filename.includes('/') || filename.includes('..')) {
    return apiError('unprocessable', 'Filename does not match this registration and division.', requestId);
  }

  const { data: objects, error: listErr } = await supabase.storage.from(BUCKET).list('', { search: filename, limit: 10 });
  const found = !listErr && (objects ?? []).find((o) => o.name === filename);
  if (!found) return apiError('unprocessable', 'Upload not found in storage. Retry the upload.', requestId);

  const sizeBytes = Number((found.metadata as { size?: number } | null)?.size);
  const { error: saveErr } = await supabase.from('vsyc_music').upsert(
    {
      registration_id: reg.id,
      division,
      object_name: filename,
      filename,
      size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      source: 'admin',
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: 'registration_id,division' },
  );
  if (saveErr) {
    console.error('[music-upload] save track error:', saveErr);
    return apiError('upstream_error', 'Could not save the track.', requestId);
  }

  if (previous && previous.object_name !== filename) {
    const { count } = await supabase
      .from('vsyc_music').select('id', { count: 'exact', head: true }).eq('object_name', previous.object_name);
    const stale = staleObjectToRemove(previous.object_name, filename, count ?? 0);
    if (stale) await supabase.storage.from(BUCKET).remove([stale]);
  }

  await logAudit(previous ? 'music_replaced' : 'music_received', {
    registrationId: reg.id,
    actor: 'admin',
    details: {
      division,
      filename,
      ...(previous ? { previous: previous.filename, previous_was_fallback: previous.is_fallback } : {}),
    },
  });

  return NextResponse.json({ ok: true, division, filename });
});
