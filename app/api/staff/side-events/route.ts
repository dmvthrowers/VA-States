import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken, type StaffIdentity } from '@/lib/auth/staff';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { dayOf } from '@/contest.config';
import { cleanSideName, isValidSideValue } from '@/lib/side-event-tools';

/**
 * Staff side-event entries. Any active staff role (judge, dj, audio_tech, admin) may record.
 *
 * GET   ?code=SLEEPER[&limit=200]  → { entries: SideEntryRow[] } newest first, hidden ones included
 * POST  { code, name, value, registration_id? } → { entry }
 * PATCH { id, hidden } → { entry }  (audit-logged)
 */

const SELECT = 'id, event_code, name, value, registration_id, hidden, created_by, created_at';

export interface SideEntryRow {
  id: string;
  event_code: string;
  name: string;
  value: number;
  registration_id: string | null;
  hidden: boolean;
  created_by: string | null;
  created_at: string;
}

const codeOk = (code: string) => dayOf.sideEvents.some((e) => e.code === code);

const postSchema = z.object({
  code: z.string().refine(codeOk, 'Unknown side event'),
  name: z.string().transform((s, ctx) => {
    const n = cleanSideName(s);
    if (!n) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name must be 1–60 characters' }); return z.NEVER; }
    return n;
  }),
  value: z.number().refine(isValidSideValue, 'Value must be 0 to 99999.99, with at most 2 decimals'),
  registration_id: z.string().uuid().nullish(),
}).strict();

const patchSchema = z.object({
  id: z.string().uuid(),
  hidden: z.boolean(),
}).strict();

type Authed = { identity: StaffIdentity } | { error: NextResponse };

async function requireStaff(req: NextRequest, requestId: string): Promise<Authed> {
  const token = getBearerToken(req);
  if (!token) return { error: apiError('unauthorized', 'Missing bearer token', requestId) };
  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive) return { error: apiError('forbidden', 'Active staff access required', requestId) };
  return { identity };
}

const noStore = (requestId: string) => ({ 'x-request-id': requestId, 'Cache-Control': 'private, no-store' });
const toRow = (r: Record<string, unknown>): SideEntryRow => ({ ...(r as unknown as SideEntryRow), value: Number(r.value) });

async function readJson(req: NextRequest): Promise<unknown> {
  try { return await req.json(); } catch { return undefined; }
}

export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaff(req, requestId);
  if ('error' in auth) return auth.error;

  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!codeOk(code)) return apiError('bad_request', 'code must be a side event', requestId);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 500, 1), 2000);

  const { data, error } = await createAdminClient()
    .from('vsyc_side_entries')
    .select(SELECT)
    .eq('event_code', code)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[staff/side-events] query error:', error);
    return apiError('upstream_error', 'Failed to fetch entries', requestId);
  }
  return NextResponse.json({ entries: (data ?? []).map(toRow) }, { headers: noStore(requestId) });
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaff(req, requestId);
  if ('error' in auth) return auth.error;
  const { identity } = auth;

  // Per staff account, so several tablets on one venue Wi-Fi don't share a budget.
  if (!(await checkRateLimit(identity.authUserId, 'side-entry', 60, 1))) {
    return apiError('rate_limited', 'Too many tries saved in a minute. Wait a moment.', requestId);
  }

  const body = await readJson(req);
  if (body === undefined) return apiError('bad_request', 'Invalid JSON body', requestId);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { code, name, value, registration_id } = parsed.data;

  const { data, error } = await createAdminClient()
    .from('vsyc_side_entries')
    .insert({ event_code: code, name, value, registration_id: registration_id ?? null, created_by: identity.displayName })
    .select(SELECT)
    .single();
  if (error) {
    // 23503: registration_id doesn't match a registration
    if (error.code === '23503') return apiError('unprocessable', 'registration_id not found', requestId);
    console.error('[staff/side-events] insert error:', error);
    return apiError('upstream_error', 'Failed to save the try', requestId);
  }
  return NextResponse.json({ entry: toRow(data) }, { status: 201, headers: noStore(requestId) });
});

export const PATCH = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireStaff(req, requestId);
  if ('error' in auth) return auth.error;
  const { identity } = auth;

  const body = await readJson(req);
  if (body === undefined) return apiError('bad_request', 'Invalid JSON body', requestId);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { id, hidden } = parsed.data;

  const { data, error } = await createAdminClient()
    .from('vsyc_side_entries')
    .update({ hidden })
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) {
    console.error('[staff/side-events] update error:', error);
    return apiError('upstream_error', 'Failed to update the try', requestId);
  }
  if (!data) return apiError('not_found', 'Try not found', requestId);

  const entry = toRow(data);
  await logAudit(hidden ? 'side_entry_hidden' : 'side_entry_unhidden', {
    actor: identity.email,
    details: { id, event_code: entry.event_code, name: entry.name, value: entry.value, by: identity.displayName },
  });
  return NextResponse.json({ entry }, { headers: noStore(requestId) });
});
