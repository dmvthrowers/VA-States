import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { resolveSlot } from '@/lib/music-config';

/**
 * POST /api/admin/mark-music  { id, division, slot?, received, filename? }
 *
 * Mark one track (a division's routine track, a round's, or an extra) as received (a file that arrived some other way) or clear it.
 * `filename` must name an object already in the music bucket when marking received.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON', requestId);
  }

  const { id, division, slot: rawSlot, received, filename } = body as Record<string, unknown>;
  if (typeof id !== 'string') return apiError('bad_request', 'id required', requestId);
  const slot = typeof division === 'string' ? resolveSlot(division, typeof rawSlot === 'string' ? rawSlot : null) : null;
  if (typeof division !== 'string' || !slot) {
    return apiError('bad_request', 'division and slot must name a music track', requestId);
  }

  const supabase = createAdminClient();

  if (received) {
    if (typeof filename !== 'string' || !filename || filename.includes('..')) {
      return apiError('bad_request', 'filename required when marking music received', requestId);
    }
    const { error } = await supabase.from('vsyc_music').upsert(
      {
        registration_id: id,
        division,
        slot,
        object_name: filename,
        filename,
        source: 'admin',
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: 'registration_id,division,slot' },
    );
    if (error) return apiError('upstream_error', 'Update failed', requestId);
  } else {
    const { error } = await supabase.from('vsyc_music').delete().eq('registration_id', id).eq('division', division).eq('slot', slot);
    if (error) return apiError('upstream_error', 'Update failed', requestId);
  }

  await logAudit(received ? 'music_received' : 'music_cleared', {
    registrationId: id,
    actor: 'admin',
    details: { division, slot, filename },
  });

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
