import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

const expiresAtField = z.string().trim().refine(
  (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)),
  'Invalid date',
).transform((v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59-04:00` : v));

const patchCodeSchema = z.object({
  active: z.boolean().optional(),
  description: z.string().trim().min(1).max(200).optional(),
  discount_percent: z.number().int().min(1).max(100).optional(),
  max_uses: z.number().int().min(1).max(1000).optional(),
  expires_at: expiresAtField.optional(),
}).strict();

type RouteParams = { params: Promise<{ code: string }> };

export const PATCH = withErrorHandling(async (requestId, req: NextRequest, ctx: RouteParams) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { code: rawCode } = await ctx.params;
  const code = decodeURIComponent(rawCode).toUpperCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = patchCodeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return apiError('bad_request', 'No fields to update', requestId);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_comp_codes')
    .update(patch)
    .eq('code', code)
    .select('code, description, discount_percent, max_uses, uses_count, expires_at, active, created_at')
    .single();

  if (error || !data) {
    return apiError('upstream_error', error?.message ?? 'Comp code not found', requestId);
  }

  await logAudit('updated', { actor: `admin:${auth.email}`, details: { type: 'comp_code', code, patch } });

  return NextResponse.json({ ok: true, code: data }, { headers: { 'x-request-id': requestId } });
});

export const DELETE = withErrorHandling(async (requestId, req: NextRequest, ctx: RouteParams) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { code: rawCode } = await ctx.params;
  const code = decodeURIComponent(rawCode).toUpperCase();

  const supabase = createAdminClient();

  // Guard: don't delete a code that has actually been used — disable it
  // instead so the audit trail / FK on past registrations stays intact.
  const { data: existing, error: fetchError } = await supabase
    .from('vsyc_comp_codes')
    .select('uses_count')
    .eq('code', code)
    .single();

  if (fetchError || !existing) {
    return apiError('not_found', 'Comp code not found', requestId);
  }

  if (existing.uses_count > 0) {
    return apiError('unprocessable', `"${code}" has already been used ${existing.uses_count} time(s) — disable it instead of deleting so past registrations stay intact.`, requestId);
  }

  const { error: deleteError } = await supabase
    .from('vsyc_comp_codes')
    .delete()
    .eq('code', code);

  if (deleteError) {
    return apiError('upstream_error', deleteError.message, requestId);
  }

  await logAudit('deleted', { actor: `admin:${auth.email}`, details: { type: 'comp_code', code } });

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
