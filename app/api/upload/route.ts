import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { buildMusicFilename, isSafeFilename } from '@/lib/filename';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { sendMusicReceivedEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const ALLOWED_MIMES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];
const MAX_BYTES = 128 * 1024 * 1024; // 128 MB
const BUCKET = 'vsyc26-music';

/**
 * Music upload — two-step signed-URL flow.
 *
 * The file goes DIRECTLY from the browser to Supabase Storage. It never
 * passes through this serverless function, so host request-body limits
 * (Vercel 4.5 MB / Netlify ~6 MB) don't apply.
 *
 *   1. POST /api/upload?token=… { action: 'sign', filename, size, type }
 *      → validates token/deadline/type/size, returns { signedUrl, path, filename }
 *   2. Browser PUTs the file to signedUrl (with upload progress).
 *   3. POST /api/upload?token=… { action: 'confirm', filename }
 *      → verifies the object exists in storage, updates the registration,
 *        writes the audit log, sends the confirmation email.
 *
 * Bucket-level mime/size limits (0002_storage_buckets.sql) are enforced by
 * Supabase on the PUT itself, so a forged 'sign' request still can't store
 * an oversized or non-audio file.
 */
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

  let body: { action?: string; filename?: string; size?: number; type?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const supabase = createAdminClient();

  // Look up registration by token
  const { data: reg, error: lookupErr } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions, email, fee_cents, paid, music_uploaded_at')
    .eq('music_upload_token', token)
    .single();

  if (lookupErr || !reg) {
    return apiError('not_found', 'Invalid or expired upload token', requestId);
  }
  if (!reg.paid && reg.fee_cents > 0) {
    return apiError('forbidden', 'Music upload unlocks after payment is received.', requestId);
  }

  // Check music deadline
  const deadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');
  if (new Date() > deadline) {
    return apiError('unprocessable', 'Music upload deadline has passed (September 12, 2026)', requestId);
  }

  const primaryDivision = reg.divisions[0] as string;

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

    const { filename, error: fnErr } = buildMusicFilename(
      primaryDivision,
      reg.last_name,
      reg.first_name,
      body.filename,
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
      { signedUrl: signed.signedUrl, path: signed.path, filename },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // ---------- STEP 2: confirm the upload landed ----------
  if (body.action === 'confirm') {
    const filename = body.filename ?? '';
    if (!filename || !isSafeFilename(filename)) {
      return apiError('bad_request', 'Missing or invalid filename', requestId);
    }

    // The filename must be the one this registration is allowed to write —
    // recompute from the record rather than trusting the client's extension.
    const { filename: canonical } = buildMusicFilename(
      primaryDivision, reg.last_name, reg.first_name, 'x.mp3',
    );
    const expectedPrefix = canonical.replace(/\.mp3$/, ''); // DIVISION_Last_First
    if (!filename.startsWith(`${expectedPrefix}.`)) {
      return apiError('unprocessable', 'Filename does not match this registration', requestId);
    }

    // Verify the object actually exists in storage before marking received.
    const { data: objects, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list('', { search: filename, limit: 10 });

    const found = !listErr && (objects ?? []).some(o => o.name === filename);
    if (!found) {
      return apiError('unprocessable', 'Upload not found in storage — please retry the upload.', requestId);
    }

    await supabase
      .from('vsyc_registrations')
      .update({
        music_path:        `${BUCKET}/${filename}`,
        music_filename:    filename,
        music_uploaded_at: new Date().toISOString(),
      })
      .eq('id', reg.id);

    await logAudit('music_received', {
      registrationId: reg.id,
      actor: 'system',
      details: { filename },
    });

    await sendMusicReceivedEmail({
      to: reg.email,
      firstName: reg.first_name,
      filename,
      division: primaryDivision,
    });

    return NextResponse.json(
      { ok: true, filename },
      { headers: { 'x-request-id': requestId } }
    );
  }

  return apiError('bad_request', "action must be 'sign' or 'confirm'", requestId);
});
