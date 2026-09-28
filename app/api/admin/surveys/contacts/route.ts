import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';

/**
 * Sponsor and vendor contacts for the survey emails (vsyc26_survey_contacts).
 * Admin only. The repo is public, so this list lives in the database and is
 * managed here rather than in code.
 */

const contactSchema = z.object({
  audience: z.enum(['sponsor', 'vendor']),
  org: z.string().trim().min(1).max(120),
  first_name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  cc: z.array(z.string().trim().toLowerCase().email().max(254)).max(5).default([]),
});

/** GET /api/admin/surveys/contacts — every contact, grouped client-side. */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await createAdminClient()
    .from('vsyc26_survey_contacts')
    .select('id, audience, org, first_name, email, cc')
    .order('audience')
    .order('org');
  if (error) throw new Error(error.message);
  return NextResponse.json({ contacts: data ?? [] }, { headers: { 'x-request-id': requestId } });
});

/** POST /api/admin/surveys/contacts — add one contact. */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const parsed = contactSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError('bad_request', 'Need audience (sponsor or vendor), org, first name and a valid email.', requestId);
  }

  const { data, error } = await createAdminClient()
    .from('vsyc26_survey_contacts')
    .insert(parsed.data)
    .select('id, audience, org, first_name, email, cc')
    .single();
  if (error?.code === '23505') {
    return apiError('conflict', `${parsed.data.email} is already on the ${parsed.data.audience} list.`, requestId);
  }
  if (error) throw new Error(error.message);

  await logAudit('survey_contact_added', {
    actor: auth.email ?? 'admin',
    details: { audience: parsed.data.audience, org: parsed.data.org },
  });
  return NextResponse.json({ contact: data }, { headers: { 'x-request-id': requestId } });
});

/** DELETE /api/admin/surveys/contacts?id=… — remove one contact. */
export const DELETE = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!z.string().uuid().safeParse(id).success) return apiError('bad_request', 'id must be a contact id', requestId);

  const { data, error } = await createAdminClient()
    .from('vsyc26_survey_contacts')
    .delete()
    .eq('id', id)
    .select('audience, org');
  if (error) throw new Error(error.message);
  if (!data?.length) return apiError('not_found', 'Contact not found', requestId);

  await logAudit('survey_contact_removed', { actor: auth.email ?? 'admin', details: data[0] });
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
