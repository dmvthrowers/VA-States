import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { getBudgetEntries, getBudgetSummary } from '@/lib/budget';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

const createEntrySchema = z.object({
  entry_type: z.enum(['income', 'expense']),
  category: z.enum(['sponsor', 'merch', 'other']),
  description: z.string().trim().min(1).max(500),
  amount_cents: z.number().int().min(0),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

/**
 * GET /api/admin/budget
 *
 * Full budget picture for the admin Budget tab: manual entries plus the
 * computed summary (registration income + entries vs. the goal). Admin-only.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const entries = await getBudgetEntries();
  const summary = await getBudgetSummary(entries);

  return NextResponse.json({ entries, summary }, { headers: { 'x-request-id': requestId } });
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = createEntrySchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_budget_entries')
    .insert({
      entry_type: parsed.data.entry_type,
      category: parsed.data.category,
      description: parsed.data.description,
      amount_cents: parsed.data.amount_cents,
      entry_date: parsed.data.entry_date ?? new Date().toISOString().slice(0, 10),
      created_by: auth.authUserId,
    })
    .select('id, created_at, updated_at, entry_type, category, description, amount_cents, entry_date')
    .single();

  if (error || !data) {
    return apiError('upstream_error', 'Failed to create budget entry', requestId);
  }

  return NextResponse.json({ ok: true, entry: data }, { headers: { 'x-request-id': requestId } });
});
