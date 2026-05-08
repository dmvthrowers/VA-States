import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { buildMusicFilename } from '@/lib/filename';
import { logAudit } from '@/lib/audit';
import { sendMusicReceivedEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_MIMES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];
const MAX_BYTES = 128 * 1024 * 1024; // 128 MB

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return apiError('bad_request', 'Missing upload token', requestId);

  const supabase = createAdminClient();

  // 1. Look up registration by token
  const { data: reg, error: lookupErr } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions, email, music_uploaded_at')
    .eq('music_upload_token', token)
    .single();

  if (lookupErr || !reg) {
    return apiError('not_found', 'Invalid or expired upload token', requestId);
  }

  // 2. Check music deadline
  const deadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');
  if (new Date() > deadline) {
    return apiError('unprocessable', 'Music upload deadline has passed (September 12, 2026)', requestId);
  }

  // 3. Parse multipart form
  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return apiError('bad_request', 'Failed to parse upload — ensure multipart/form-data', requestId);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return apiError('bad_request', 'No file provided in "file" field', requestId);
  }

  // 4. Validate MIME + size
  if (!ALLOWED_MIMES.includes(file.type)) {
    return apiError('unprocessable', `File type ${file.type} not accepted. Use MP3, WAV, or M4A.`, requestId);
  }
  if (file.size > MAX_BYTES) {
    return apiError('unprocessable', 'File exceeds 128 MB limit', requestId);
  }

  // 5. Build enforced filename
  const primaryDivision = reg.divisions[0] as string;
  const { filename, error: fnErr } = buildMusicFilename(
    primaryDivision,
    reg.last_name,
    reg.first_name,
    file.name,
  );
  if (fnErr) return apiError('unprocessable', fnErr, requestId);

  // 6. Upload to Supabase Storage
  const buffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from('vsyc26-music')
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    console.error('[upload] storage error:', uploadErr);
    return apiError('upstream_error', 'File storage failed. Please try again.', requestId);
  }

  // 7. Update registration record
  await supabase
    .from('vsyc_registrations')
    .update({
      music_path:        `vsyc26-music/${filename}`,
      music_filename:    filename,
      music_uploaded_at: new Date().toISOString(),
    })
    .eq('id', reg.id);

  // 8. Audit + email
  await logAudit('music_received', {
    registrationId: reg.id,
    actor: 'system',
    details: { filename, size_bytes: file.size },
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
