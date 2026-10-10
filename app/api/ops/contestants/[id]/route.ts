import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest as requireAdmin } from '@/lib/auth/admin-request';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { DIVISION_CODES } from '@/contest.config';
import { cleanStyles } from '@/lib/divisions-core';

const updateContestantSchema = z.object({
  paid: z.boolean().optional(),
  divisions: z.array(z.string().trim().max(20)).min(1).max(20)
    .refine((d) => d.every((c) => DIVISION_CODES.includes(c)), 'Unknown division').optional(),
  /** Style codes per division, e.g. { "X": ["2A"] }. The database checks they exist. */
  division_styles: z.record(z.string().max(20), z.array(z.string().max(20)).max(20)).optional(),
  is_public: z.boolean().optional(),
  /** Home-state champion eligibility: true/false overrides the automatic answer, null goes back to automatic */
  home_state_override: z.boolean().nullable().optional(),
  admin_notes: z.string().trim().max(2000).optional().or(z.literal('')),
}).strict();

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

  if (Object.prototype.hasOwnProperty.call(updatePayload, 'admin_notes')) {
    normalized.admin_notes = updatePayload.admin_notes || null;
  }
  const supabase = createAdminClient();

  // Styles only make sense for selected divisions: keep them consistent when either changes.
  if (updatePayload.divisions || updatePayload.division_styles) {
    const { data: current } = await supabase
      .from('vsyc_registrations')
      .select('divisions, division_styles')
      .eq('id', id)
      .maybeSingle();
    const divisions = updatePayload.divisions ?? (current?.divisions as string[] | undefined) ?? [];
    normalized.division_styles = cleanStyles(divisions, updatePayload.division_styles ?? (current?.division_styles as Record<string, string[]> | undefined));
  }

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

  if (Object.prototype.hasOwnProperty.call(updatePayload, 'home_state_override')) {
    await logAudit('home_state_override_set', {
      registrationId: id,
      actor: auth.email ?? 'admin',
      details: { override: updatePayload.home_state_override ?? null },
    });
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
