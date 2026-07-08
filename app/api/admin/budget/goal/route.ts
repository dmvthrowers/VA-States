import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

const goalSchema = z.object({
  goal_cents: z.number().int().min(0),
}).strict();

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = goalSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_budget_goal')
    .upsert({ id: true, goal_cents: parsed.data.goal_cents }, { onConflict: 'id' });

  if (error) {
    return apiError('upstream_error', 'Failed to update fundraising goal', requestId);
  }

  return NextResponse.json({ ok: true, goal_cents: parsed.data.goal_cents }, { headers: { 'x-request-id': requestId } });
});
