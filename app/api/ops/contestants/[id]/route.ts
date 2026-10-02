import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';

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
  const supabase = createAdminClient();

  // Only a real change to paid is applied (and audited). A stale dashboard row
  // sending its old value must not reset a payment that landed since.
  let paidChange: { from: boolean; to: boolean; payment_method: string | null } | null = null;
  if (Object.prototype.hasOwnProperty.call(updatePayload, 'paid')) {
    const { data: current } = await supabase
      .from('vsyc_registrations')
      .select('paid, payment_method')
      .eq('id', id)
      .maybeSingle();
    if (current && current.paid === updatePayload.paid) {
      delete normalized.paid;
    } else {
      normalized.paid_at = updatePayload.paid ? new Date().toISOString() : null;
      paidChange = { from: current?.paid ?? false, to: Boolean(updatePayload.paid), payment_method: current?.payment_method ?? null };
    }
  }
  const { error } = await supabase
    .from('vsyc_registrations')
    .update(normalized)
    .eq('id', id);

  if (error) {
    return apiError('upstream_error', 'Failed to update contestant', requestId);
  }

  if (paidChange) {
    await logAudit(paidChange.to ? 'marked_paid' : 'marked_unpaid', {
      registrationId: id,
      actor: auth.email ?? 'admin',
      details: { via: 'admin_dashboard', previous_payment_method: paidChange.payment_method },
    });
  }

  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
