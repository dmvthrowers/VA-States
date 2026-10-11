import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { contest } from '@/contest.config';
import { formReviewAuth } from '@/lib/forms-server';
import { SUBMISSION_STATUSES } from '@/lib/forms';

/**
 * GET /api/admin/forms?form=<id>&status=<status>: the forms in the config, and answers to them, newest first
 * (up to 200). Needs `forms.review`. Answers are personal data, so nothing is cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await formReviewAuth(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const formId = url.searchParams.get('form');
  const status = url.searchParams.get('status');
  if (status && !(SUBMISSION_STATUSES as readonly string[]).includes(status)) return apiError('bad_request', 'Unknown status', requestId);
  // Answers to a form that was removed from the config are still readable until they are deleted.
  const forms = contest.forms.map((f) => ({ id: f.id, title: f.title, enabled: f.enabled, fields: f.fields.map((x) => ({ id: x.id, label: x.label })) }));

  let q = createAdminClient().from('vsyc_form_submissions').select('*').order('created_at', { ascending: false }).limit(200);
  if (formId) q = q.eq('form_id', formId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return apiError('upstream_error', 'Could not load answers', requestId);
  return NextResponse.json({ forms, submissions: data ?? [] }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } });
});
