import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { inquiryToSponsor } from '@/lib/sponsor-inquiry';
import { loadSponsorSettings } from '@/lib/sponsor-settings-server';

const body = z.object({ action: z.enum(['convert', 'dismiss']) }).strict();

/**
 * POST /api/admin/sponsors/inquiries/[id]  { action: 'convert' | 'dismiss' }
 * Convert makes a prospect in the sponsor pipeline (nothing counted as money) and marks the inquiry converted;
 * dismiss marks it dismissed. Each only works on a new inquiry, so a double click can't create two sponsors.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);

  const db = createAdminClient();
  const { data: inq } = await db.from('vsyc_sponsor_inquiries').select('*').eq('id', id).maybeSingle();
  if (!inq) return apiError('not_found', 'No inquiry with that id', requestId);
  if (inq.status !== 'new') return apiError('conflict', 'That inquiry was already handled.', requestId);

  const now = new Date().toISOString();

  if (parsed.data.action === 'dismiss') {
    const { data, error } = await db
      .from('vsyc_sponsor_inquiries')
      .update({ status: 'dismissed', handled_by: auth.authUserId, handled_at: now })
      .eq('id', id).eq('status', 'new').select('id');
    if (error) return apiError('upstream_error', 'Could not dismiss the inquiry', requestId);
    if (!data?.length) return apiError('conflict', 'That inquiry was already handled.', requestId);
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
  }

  // Claim it first (new -> converted) so two people can't both convert it, then create the sponsor.
  const { data: claimed, error: claimErr } = await db
    .from('vsyc_sponsor_inquiries')
    .update({ status: 'converted', handled_by: auth.authUserId, handled_at: now })
    .eq('id', id).eq('status', 'new').select('id');
  if (claimErr) return apiError('upstream_error', 'Could not convert the inquiry', requestId);
  if (!claimed?.length) return apiError('conflict', 'That inquiry was already handled.', requestId);

  const { data: sponsor, error: sponsorErr } = await db.from('vsyc_sponsors').insert(inquiryToSponsor(inq, (await loadSponsorSettings()).settings)).select('id').single();
  if (sponsorErr || !sponsor) {
    // Put it back so it can be tried again; nothing was created.
    await db.from('vsyc_sponsor_inquiries').update({ status: 'new', handled_by: null, handled_at: null }).eq('id', id);
    return apiError('upstream_error', 'Could not create the sponsor. The inquiry is still waiting.', requestId);
  }
  await db.from('vsyc_sponsor_inquiries').update({ sponsor_id: sponsor.id }).eq('id', id);
  return NextResponse.json({ ok: true, sponsor_id: sponsor.id }, { headers: { 'x-request-id': requestId } });
});
