import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { buildMusicFilename } from '@/lib/filename';
import { logAudit } from '@/lib/audit';
import { sendMusicReceivedEmail } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const completeSchema = z.object({
  token:    z.string().min(10).max(100),
  filename: z.string().min(1).max(255),
});

/**
 * POST /api/upload/complete
 *
 * Called after the browser finishes a direct-to-Storage upload (see
 * /api/upload/init). Verifies the file actually landed under the
 * registrant's own enforced filename, then records it and sends the
 * confirmation email.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const { token, filename: claimedFilename } = parsed.data;

  const supabase = createAdminClient();

  const { data: reg, error: lookupErr } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions, email')
    .eq('music_upload_token', token)
    .single();

  if (lookupErr || !reg) {
    return apiError('not_found', 'Invalid or expired upload token', requestId);
  }

  // Recompute the enforced filename from this registration's own data —
  // a token holder can only ever claim their own file path.
  const primaryDivision = reg.divisions[0] as string;
  const { filename: expectedFilename, error: fnErr } = buildMusicFilename(
    primaryDivision,
    reg.last_name,
    reg.first_name,
    claimedFilename,
  );
  if (fnErr || expectedFilename !== claimedFilename) {
    return apiError('unprocessable', 'Filename does not match this registration', requestId);
  }

  const { data: objects, error: listErr } = await supabase.storage
    .from('vsyc26-music')
    .list('', { search: expectedFilename, limit: 100 });

  if (listErr) {
    console.error('[upload/complete] list error:', listErr);
    return apiError('upstream_error', 'Could not verify upload. Please try again.', requestId);
  }
  const uploaded = (objects ?? []).find((o) => o.name === expectedFilename);
  if (!uploaded) {
    return apiError('unprocessable', 'Upload not found in storage — please retry the upload', requestId);
  }

  const { error: updateErr } = await supabase
    .from('vsyc_registrations')
    .update({
      music_path:        `vsyc26-music/${expectedFilename}`,
      music_filename:    expectedFilename,
      music_uploaded_at: new Date().toISOString(),
    })
    .eq('id', reg.id);

  if (updateErr) {
    console.error('[upload/complete] update error:', updateErr);
    return apiError('upstream_error', 'Failed to record upload. Please try again.', requestId);
  }

  await logAudit('music_received', {
    registrationId: reg.id,
    actor: 'system',
    details: { filename: expectedFilename, size_bytes: uploaded.metadata?.size ?? null },
  });

  await sendMusicReceivedEmail({
    to: reg.email,
    firstName: reg.first_name,
    filename: expectedFilename,
    division: primaryDivision,
  });

  return NextResponse.json(
    { ok: true, filename: expectedFilename },
    { headers: { 'x-request-id': requestId } },
  );
});
