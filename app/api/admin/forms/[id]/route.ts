import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { formReviewAuth } from '@/lib/forms-server';
import { SUBMISSION_STATUSES } from '@/lib/forms';

const body = z.object({
  status: z.enum(SUBMISSION_STATUSES),
  note: z.string().trim().max(2000).optional(),
}).strict();

/** PATCH /api/admin/forms/[id]  { status, note? }: mark an answer read, handled or dismissed, with a private note. Needs `forms.review`. */
export const PATCH = withErrorHandling(async (requestId, req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await formReviewAuth(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError('bad_request', 'Not a valid id', requestId);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);

  const update: Record<string, unknown> = { status: parsed.data.status, handled_by: auth.authUserId, handled_at: new Date().toISOString() };
  if (parsed.data.note !== undefined) update.note = parsed.data.note || null;
  const { data, error } = await createAdminClient().from('vsyc_form_submissions').update(update).eq('id', id).select('id').maybeSingle();
  if (error) return apiError('upstream_error', 'Could not update that answer', requestId);
  if (!data) return apiError('not_found', 'No answer with that id', requestId);
  return NextResponse.json({ ok: true }, { headers: { 'x-request-id': requestId } });
});
