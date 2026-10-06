import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { buildMusicFilename, isSafeFilename } from '@/lib/filename';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { sendMusicReceivedEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';
import { contest } from '@/contest.config';
import { buildSlots, playerSlots, needsReplaceConfirm, staleObjectToRemove, type MusicTrack } from '@/lib/music';
import { divisionName, resolveSlot, slotLabel, slotsOf } from '@/lib/music-config';

export const runtime = 'nodejs';

const ALLOWED_MIMES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];
const MAX_BYTES = 128 * 1024 * 1024; // 128 MB
const BUCKET = 'vsyc26-music';

const TRACK_FIELDS = 'division, slot, object_name, filename, source, is_fallback, uploaded_at';

function deadlineLabel(): string {
  return new Date(contest.deadlines.musicUpload).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: contest.timeZone,
  });
}

/**
 * Music upload: one track per slot. A slot is a track a division asks for (contest.config.ts):
 * one routine track for the division, one per round (prelims, final...), or extras such as
 * battle music. A 1A + X player with prelims and final music has four slots.
 *
 *   GET  /api/upload?token=…
 *        → { first_name, unlocked, deadline_iso, deadline_passed, slots: [{ division, slot, label, status, track }] }
 *
 * The file goes DIRECTLY from the browser to Supabase Storage. It never passes through this
 * serverless function, so host request-body limits (Vercel 4.5 MB / Netlify ~6 MB) don't apply.
 *
 *   1. POST /api/upload?token=… { action: 'sign', division, slot?, filename, size, type, replace? }
 *      (`slot` may be left out when the division has a single track)
 *      → validates token/deadline/division/type/size, returns { signedUrl, path, filename }.
 *        A slot that already holds the player's own track is refused (409) unless `replace: true`.
 *   2. Browser PUTs the file to signedUrl (with upload progress).
 *   3. POST /api/upload?token=… { action: 'confirm', division, slot?, filename }
 *      → verifies the object exists in storage, records the track for that division, writes the
 *        audit log (music_received / music_replaced), sends the confirmation email.
 *
 * Bucket-level mime/size limits (0002_storage_buckets.sql) are enforced by Supabase on the PUT
 * itself, so a forged 'sign' request still can't store an oversized or non-audio file.
 */

async function loadRegistration(token: string) {
  const supabase = createAdminClient();
  const { data: reg, error } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions, email, fee_cents, paid')
    .eq('music_upload_token', token)
    .single();
  return { supabase, reg: error ? null : reg };
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return apiError('bad_request', 'Missing upload token', requestId);

  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'upload-status', 120, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many requests. Try again later.', requestId, { 'Retry-After': '3600' });
  }

  const { supabase, reg } = await loadRegistration(token);
  if (!reg) return apiError('not_found', 'Invalid or expired upload token', requestId);

  const { data: tracks, error } = await supabase
    .from('vsyc_music')
    .select(TRACK_FIELDS)
    .eq('registration_id', reg.id);
  if (error) {
    console.error('[upload] tracks lookup error:', error);
    return apiError('upstream_error', 'Could not load your music slots', requestId);
  }

  const deadline = new Date(contest.deadlines.musicUpload);
  return NextResponse.json(
    {
      first_name: reg.first_name,
      unlocked: reg.paid || reg.fee_cents === 0,
      deadline_iso: deadline.toISOString(),
      deadline_label: deadlineLabel(),
      deadline_passed: new Date() > deadline,
      slots: buildSlots(reg.divisions as string[], (tracks ?? []) as MusicTrack[], slotsOf, divisionName),
    },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return apiError('bad_request', 'Missing upload token', requestId);

  // Rate limit — 30 upload API calls per IP per hour (sign + confirm pairs).
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'upload', 30, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many upload attempts. Try again later.', requestId, {
      'Retry-After': '3600',
    });
  }

  let body: { action?: string; division?: string; slot?: string; filename?: string; size?: number; type?: string; replace?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const { supabase, reg } = await loadRegistration(token);
  if (!reg) {
    return apiError('not_found', 'Invalid or expired upload token', requestId);
  }
  if (!reg.paid && reg.fee_cents > 0) {
    return apiError('forbidden', 'Music upload unlocks after payment is received.', requestId);
  }

  // Check music deadline
  if (new Date() > new Date(contest.deadlines.musicUpload)) {
    return apiError('unprocessable', `Music upload deadline has passed (${deadlineLabel()})`, requestId);
  }

  // Which of the player's tracks is this: a division and a slot within it?
  const mine = playerSlots(reg.divisions as string[], slotsOf);
  const division = body.division;
  const slot = division ? resolveSlot(division, body.slot) : null;
  if (!division || !slot || !mine.some((m) => m.division === division && m.slot === slot)) {
    return apiError(
      'bad_request',
      mine.length
        ? `division and slot must be one of: ${mine.map((m) => `${m.division}/${m.slot}`).join(', ')}`
        : 'None of your divisions use music.',
      requestId,
    );
  }

  const { data: existing } = await supabase
    .from('vsyc_music')
    .select(TRACK_FIELDS)
    .eq('registration_id', reg.id)
    .eq('division', division)
    .eq('slot', slot)
    .maybeSingle();
  const previous = (existing ?? null) as MusicTrack | null;

  // ---------- STEP 1: mint a signed upload URL ----------
  if (body.action === 'sign') {
    if (!body.filename) {
      return apiError('bad_request', 'Missing filename', requestId);
    }
    if (typeof body.size !== 'number' || body.size <= 0 || body.size > MAX_BYTES) {
      return apiError('unprocessable', 'File exceeds 128 MB limit', requestId);
    }
    if (!body.type || !ALLOWED_MIMES.includes(body.type)) {
      return apiError('unprocessable', `File type ${body.type ?? '(unknown)'} not accepted. Use MP3, WAV, or M4A.`, requestId);
    }

    // Never silently overwrite: replacing a track the player already uploaded is explicit.
    if (needsReplaceConfirm(previous) && body.replace !== true) {
      return apiError(
        'conflict',
        `You already uploaded a track for ${division} ${slotLabel(division, slot)} (${previous!.filename}). Confirm to replace it.`,
        requestId,
      );
    }

    const { filename, error: fnErr } = buildMusicFilename(
      division,
      reg.last_name,
      reg.first_name,
      body.filename,
      slot,
    );
    if (fnErr) return apiError('unprocessable', fnErr, requestId);

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(filename, { upsert: true });

    if (signErr || !signed) {
      console.error('[upload] createSignedUploadUrl error:', signErr);
      return apiError('upstream_error', 'Could not prepare upload. Please try again.', requestId);
    }

    return NextResponse.json(
      { signedUrl: signed.signedUrl, path: signed.path, filename, division, slot },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // ---------- STEP 2: confirm the upload landed ----------
  if (body.action === 'confirm') {
    const filename = body.filename ?? '';
    if (!filename || !isSafeFilename(filename)) {
      return apiError('bad_request', 'Missing or invalid filename', requestId);
    }

    // The filename must be the one this registration is allowed to write for this division:
    // recompute from the record rather than trusting the client's extension.
    const { filename: canonical } = buildMusicFilename(
      division, reg.last_name, reg.first_name, 'x.mp3', slot,
    );
    const expectedPrefix = canonical.replace(/\.mp3$/, ''); // DIVISION_Last_First
    if (!filename.startsWith(`${expectedPrefix}.`)) {
      return apiError('unprocessable', 'Filename does not match this registration', requestId);
    }

    // Verify the object actually exists in storage before marking received.
    const { data: objects, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list('', { search: filename, limit: 10 });

    const found = !listErr && (objects ?? []).find(o => o.name === filename);
    if (!found) {
      return apiError('unprocessable', 'Upload not found in storage — please retry the upload.', requestId);
    }

    const sizeBytes = Number((found.metadata as { size?: number } | null)?.size);
    const { error: saveErr } = await supabase
      .from('vsyc_music')
      .upsert(
        {
          registration_id: reg.id,
          division,
          slot,
          object_name: filename,
          filename,
          size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
          source: 'player',
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'registration_id,division,slot' },
      );
    if (saveErr) {
      console.error('[upload] save track error:', saveErr);
      return apiError('upstream_error', 'Could not save your track. Please try again.', requestId);
    }

    // A replacement with a different extension leaves the old file behind: remove it.
    if (previous && previous.object_name !== filename) {
      const { count } = await supabase
        .from('vsyc_music')
        .select('id', { count: 'exact', head: true })
        .eq('object_name', previous.object_name);
      const stale = staleObjectToRemove(previous.object_name, filename, count ?? 0);
      if (stale) await supabase.storage.from(BUCKET).remove([stale]);
    }

    await logAudit(previous ? 'music_replaced' : 'music_received', {
      registrationId: reg.id,
      actor: 'system',
      details: {
        division,
        slot,
        filename,
        ...(previous ? { previous: previous.filename, previous_was_fallback: previous.is_fallback } : {}),
      },
    });

    await sendMusicReceivedEmail({
      to: reg.email,
      firstName: reg.first_name,
      filename,
      division,
      slotLabel: mine.find((m) => m.division === division && m.slot === slot)?.labelled ? slotLabel(division, slot) : undefined,
    });

    return NextResponse.json(
      { ok: true, filename, division, slot, replaced: !!previous },
      { headers: { 'x-request-id': requestId } }
    );
  }

  return apiError('bad_request', "action must be 'sign' or 'confirm'", requestId);
});
