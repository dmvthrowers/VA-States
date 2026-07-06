import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getEventFlagBoolean } from '@/lib/event-flags';
import { z } from 'zod';

const eventFlagsPatchSchema = z.object({
  results_published: z.boolean().optional(),
  online_registration_open: z.boolean().optional(),
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

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      results_published: await getEventFlagBoolean('results_published', process.env.RESULTS_PUBLISHED === 'true'),
      online_registration_open: await getEventFlagBoolean('online_registration_open', true),
    },
    { headers: { 'x-request-id': requestId } }
  );
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = eventFlagsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const keyMap: Record<string, string> = {
    results_published: 'results_published',
    online_registration_open: 'online_registration_open',
  };

  const rows = Object.entries(patch).map(([k, v]) => ({
    key: keyMap[k],
    value_bool: Boolean(v),
    updated_at: new Date().toISOString(),
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('vsyc_event_flags')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    return apiError('upstream_error', 'Failed to update event flags', requestId);
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
