import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildMusicFilename } from '@/lib/filename';
import { logAudit } from '@/lib/audit';
import { sendMusicReceivedEmail } from '@/lib/email';
import { getDb, getMusicBucket, parseDivisions } from '@/lib/db';

// Buffered in the Worker before the R2 put, so capped well under the
// 128 MB isolate memory limit. Plenty for a freestyle track.
const MAX_BYTES = 50 * 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

interface RegRow {
  id: string;
  first_name: string;
  last_name: string;
  divisions: string;
  email: string;
}

/**
 * POST /api/upload?token=...
 *
 * Direct music upload: raw file body, original filename in the
 * x-original-filename header (URI-encoded). The file is stored in R2 under
 * the enforced DIVISION_Last_First.ext name derived from the registration.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return apiError('bad_request', 'Missing upload token', requestId);

  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'upload', 20, 15);
  if (!allowed) return apiError('rate_limited', 'Too many upload attempts. Try again later.', requestId);

  // 1. Look up registration by token
  const reg = await getDb()
    .prepare(
      `SELECT id, first_name, last_name, divisions, email
       FROM vsyc_registrations WHERE music_upload_token = ?1`
    )
    .bind(token)
    .first<RegRow>();

  if (!reg) return apiError('not_found', 'Invalid or expired upload token', requestId);

  // 2. Check music deadline
  const deadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');
  if (new Date() > deadline) {
    return apiError('unprocessable', 'Music upload deadline has passed (September 12, 2026)', requestId);
  }

  // 3. Enforced filename from the registration's own data
  let originalName = '';
  try { originalName = decodeURIComponent(req.headers.get('x-original-filename') ?? ''); } catch { /* keep '' */ }
  if (!originalName) return apiError('bad_request', 'Missing x-original-filename header', requestId);

  const divisions = parseDivisions(reg.divisions);
  const primaryDivision = divisions[0] ?? '';
  const { filename, error: fnErr } = buildMusicFilename(
    primaryDivision,
    reg.last_name,
    reg.first_name,
    originalName,
  );
  if (fnErr) return apiError('unprocessable', fnErr, requestId);

  // 4. Size check, then read the body
  const declaredSize = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (declaredSize > MAX_BYTES) {
    return apiError('unprocessable', 'File exceeds 50 MB limit', requestId);
  }

  const buffer = await req.arrayBuffer();
  if (buffer.byteLength === 0) return apiError('bad_request', 'Empty file', requestId);
  if (buffer.byteLength > MAX_BYTES) {
    return apiError('unprocessable', 'File exceeds 50 MB limit', requestId);
  }

  // 5. Store in R2 (overwrites any previous upload for this registrant)
  const ext = filename.split('.').pop() as string;
  try {
    await getMusicBucket().put(filename, buffer, {
      httpMetadata: { contentType: CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream' },
    });
  } catch (uploadErr) {
    console.error('[upload] R2 error:', uploadErr);
    return apiError('upstream_error', 'File storage failed. Please try again.', requestId);
  }

  // 6. Update registration record
  await getDb()
    .prepare(
      `UPDATE vsyc_registrations
       SET music_path = ?1, music_filename = ?2, music_uploaded_at = ?3
       WHERE id = ?4`
    )
    .bind(`vsyc26-music/${filename}`, filename, new Date().toISOString(), reg.id)
    .run();

  // 7. Audit + email
  await logAudit('music_received', {
    registrationId: reg.id,
    actor: 'system',
    details: { filename, size_bytes: buffer.byteLength },
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
});
