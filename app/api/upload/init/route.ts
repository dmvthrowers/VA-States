import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { buildMusicFilename } from '@/lib/filename';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const MAX_BYTES = 128 * 1024 * 1024; // matches bucket file_size_limit

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

const initSchema = z.object({
  token:    z.string().min(10).max(100),
  filename: z.string().min(1).max(255),
  size:     z.number().int().min(1).max(MAX_BYTES),
});

/**
 * POST /api/upload/init
 *
 * Validates the registrant's upload token and mints a signed Storage upload
 * URL for their enforced filename. The browser uploads directly to Supabase
 * Storage (Vercel serverless functions cap request bodies at ~4.5 MB, so the
 * file can't be proxied through this API). Call /api/upload/complete after
 * the upload succeeds.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'upload-init', 20, 15);
  if (!allowed) return apiError('rate_limited', 'Too many upload attempts. Try again later.', requestId);

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const { token, filename: originalFilename } = parsed.data;

  const supabase = createAdminClient();

  const { data: reg, error: lookupErr } = await supabase
    .from('vsyc_registrations')
    .select('id, first_name, last_name, divisions')
    .eq('music_upload_token', token)
    .single();

  if (lookupErr || !reg) {
    return apiError('not_found', 'Invalid or expired upload token', requestId);
  }

  const deadline = new Date(process.env.MUSIC_DEADLINE_ISO ?? '2026-09-12T23:59:59-04:00');
  if (new Date() > deadline) {
    return apiError('unprocessable', 'Music upload deadline has passed (September 12, 2026)', requestId);
  }

  const primaryDivision = reg.divisions[0] as string;
  const { filename, error: fnErr } = buildMusicFilename(
    primaryDivision,
    reg.last_name,
    reg.first_name,
    originalFilename,
  );
  if (fnErr) return apiError('unprocessable', fnErr, requestId);

  const ext = filename.split('.').pop() as string;

  const { data: signed, error: signErr } = await supabase.storage
    .from('vsyc26-music')
    .createSignedUploadUrl(filename, { upsert: true });

  if (signErr || !signed) {
    console.error('[upload/init] sign error:', signErr);
    return apiError('upstream_error', 'Could not prepare upload. Please try again.', requestId);
  }

  return NextResponse.json(
    {
      signed_url:   signed.signedUrl,
      filename,
      content_type: CONTENT_TYPE_BY_EXT[ext] ?? 'audio/mpeg',
    },
    { headers: { 'x-request-id': requestId } },
  );
});
