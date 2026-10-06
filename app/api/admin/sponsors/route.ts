import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { sponsorFields } from '@/lib/sponsors-server';
import { cleanDeliverables, summarizeSponsors, type Deliverable } from '@/lib/sponsors';

/**
 * Sponsor pipeline (prospect to paid) with deliverables. Admin only here; the registration template has
 * finer-grained roles (organizer, a sponsor's own read-only login).
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from('vsyc_sponsors').select('*').order('created_at', { ascending: true });
  if (error) return apiError('upstream_error', 'Could not load sponsors', requestId);

  const sponsors = (data ?? []).map((s) => ({ ...s, deliverables: (s.deliverables ?? []) as Deliverable[] }));
  return NextResponse.json(
    { manage: true, sponsors, summary: summarizeSponsors(sponsors) },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } },
  );
});

export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = sponsorFields.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);

  const d = parsed.data;
  const { data, error } = await createAdminClient()
    .from('vsyc_sponsors')
    .insert({
      name: d.name,
      tier: d.tier || null,
      status: d.status,
      amount_cents: d.amount_cents,
      in_kind: d.in_kind || null,
      contact_name: d.contact_name || null,
      contact_email: d.contact_email || null,
      notes: d.notes || null,
      deliverables: cleanDeliverables(d.deliverables),
      auth_user_id: d.auth_user_id ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return apiError('upstream_error', 'Could not save the sponsor', requestId);
  return NextResponse.json({ ok: true, id: data.id }, { status: 201, headers: { 'x-request-id': requestId } });
});
