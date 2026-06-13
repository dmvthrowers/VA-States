import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { getDb } from '@/lib/db';

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON', requestId);
  }

  const { id, received, filename } = body as Record<string, unknown>;
  if (typeof id !== 'string') return apiError('bad_request', 'id required', requestId);

  try {
    await getDb()
      .prepare('UPDATE vsyc_registrations SET music_uploaded_at = ?1, music_filename = ?2 WHERE id = ?3')
      .bind(
        received ? new Date().toISOString() : null,
        typeof filename === 'string' ? filename : null,
        id,
      )
      .run();
  } catch (e) {
    console.error('[mark-music] update error:', e);
    return apiError('upstream_error', 'Update failed', requestId);
  }

  await logAudit(received ? 'music_received' : 'music_cleared', {
    registrationId: id,
    actor: 'admin',
    details: { filename },
  });

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
