import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON', requestId);
  }

  const { id, received, filename } = body as Record<string, unknown>;
  if (typeof id !== 'string') return apiError('bad_request', 'id required', requestId);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_registrations')
    .update({
      music_uploaded_at: received ? new Date().toISOString() : null,
      music_filename:    filename ?? null,
    })
    .eq('id', id);

  if (error) return apiError('upstream_error', 'Update failed', requestId);

  await logAudit(received ? 'music_received' : 'music_cleared', {
    registrationId: id,
    actor: 'admin',
    details: { filename },
  });

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
