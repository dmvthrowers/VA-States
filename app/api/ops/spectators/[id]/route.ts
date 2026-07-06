import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { z } from 'zod';

const updateSpectatorSchema = z.object({
  nickname: z.string().trim().max(50).optional().or(z.literal('')),
  state: z.string().trim().length(2).toUpperCase().optional(),
  team: z.string().trim().max(100).optional().or(z.literal('')),
  club: z.string().trim().max(100).optional().or(z.literal('')),
  is_public: z.boolean().optional(),
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
    return apiError('bad_request', 'Missing spectator id', requestId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = updateSpectatorSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const updatePayload = parsed.data;
  if (Object.keys(updatePayload).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const normalized: Record<string, unknown> = {
    ...updatePayload,
    nickname: Object.prototype.hasOwnProperty.call(updatePayload, 'nickname') ? (updatePayload.nickname || null) : undefined,
    team: Object.prototype.hasOwnProperty.call(updatePayload, 'team') ? (updatePayload.team || null) : undefined,
    club: Object.prototype.hasOwnProperty.call(updatePayload, 'club') ? (updatePayload.club || null) : undefined,
  };

  Object.keys(normalized).forEach((k) => {
    if (normalized[k] === undefined) delete normalized[k];
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_spectators')
    .update(normalized)
    .eq('id', id);

  if (error) {
    return apiError('upstream_error', 'Failed to update spectator', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
