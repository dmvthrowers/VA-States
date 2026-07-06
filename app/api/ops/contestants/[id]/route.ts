import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { z } from 'zod';

const updateContestantSchema = z.object({
  paid: z.boolean().optional(),
  divisions: z.array(z.enum(['1A', 'X', 'SBJ'])).min(1).max(3).optional(),
  x_substyle: z.string().trim().max(40).optional().or(z.literal('')),
  music_filename: z.string().trim().max(200).optional().or(z.literal('')),
  is_public: z.boolean().optional(),
  admin_notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).strict();

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

export const PATCH = withErrorHandling(async (requestId, req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!id) {
    return apiError('bad_request', 'Missing registration id', requestId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = updateContestantSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const updatePayload = parsed.data;
  if (Object.keys(updatePayload).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const normalized: Record<string, unknown> = {
    ...updatePayload,
  };

  if (Object.prototype.hasOwnProperty.call(updatePayload, 'music_filename')) {
    normalized.music_filename = updatePayload.music_filename || null;
  }
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'x_substyle')) {
    normalized.x_substyle = updatePayload.x_substyle || null;
  }
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'admin_notes')) {
    normalized.admin_notes = updatePayload.admin_notes || null;
  }
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'paid')) {
    normalized.paid_at = updatePayload.paid ? new Date().toISOString() : null;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_registrations')
    .update(normalized)
    .eq('id', id);

  if (error) {
    return apiError('upstream_error', 'Failed to update contestant', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
