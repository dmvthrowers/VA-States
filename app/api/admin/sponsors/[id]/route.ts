import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanDeliverables } from '@/lib/sponsors';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { sponsorFields } from '@/lib/sponsors-server';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (requestId, req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = sponsorFields.partial().safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);

  const d = parsed.data;
  const update: Record<string, unknown> = {};
  if (d.name !== undefined) update.name = d.name;
  if (d.tier !== undefined) update.tier = d.tier || null;
  if (d.status !== undefined) update.status = d.status;
  if (d.amount_cents !== undefined) update.amount_cents = d.amount_cents;
  if (d.in_kind !== undefined) update.in_kind = d.in_kind || null;
  if (d.contact_name !== undefined) update.contact_name = d.contact_name || null;
  if (d.contact_email !== undefined) update.contact_email = d.contact_email || null;
  if (d.notes !== undefined) update.notes = d.notes || null;
  if (d.deliverables !== undefined) update.deliverables = cleanDeliverables(d.deliverables);
  if (d.auth_user_id !== undefined) update.auth_user_id = d.auth_user_id ?? null;
  if (Object.keys(update).length === 0) return apiError('bad_request', 'No fields to update', requestId);

  const { data, error } = await createAdminClient().from('vsyc_sponsors').update(update).eq('id', id).select('id');
  if (error) return apiError('upstream_error', 'Could not save the sponsor', requestId);
  if (!data || data.length === 0) return apiError('not_found', 'No sponsor with that id', requestId);
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});

export const DELETE = withErrorHandling(async (requestId, req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const { data, error } = await createAdminClient().from('vsyc_sponsors').delete().eq('id', id).select('id');
  if (error) return apiError('upstream_error', 'Could not delete the sponsor', requestId);
  if (!data || data.length === 0) return apiError('not_found', 'No sponsor with that id', requestId);
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
