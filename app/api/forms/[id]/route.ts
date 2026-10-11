import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyTurnstile, withoutTurnstileToken } from '@/lib/turnstile';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseSubmission, publicForm, submissionRow } from '@/lib/forms';
import { findForm } from '@/lib/forms-server';
import { sendFormNoticeEmail } from '@/lib/email';

/** GET /api/forms/[id]: the form the page should show (fields only; nothing about answers). */
export const GET = withErrorHandling(async (requestId, _req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const form = findForm(id);
  if (!form) return apiError('not_found', 'That form is not open.', requestId);
  return NextResponse.json(publicForm(form), { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
});

/**
 * POST /api/forms/[id]
 *
 * Public, unauthenticated. No CAPTCHA service and no analytics: a honeypot, a per-IP rate limit and validation
 * against the form's own field list. The answers go to vsyc_form_submissions (service role only). The IP is used
 * for the rate limit and never saved.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const form = findForm(id);
  if (!form) return apiError('not_found', 'That form is not open.', requestId);

  const allowed = await checkRateLimit(getClientIp(req.headers), `form-${form.id}`, 5, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many submissions from this network. Try again later.', requestId, { 'Retry-After': '3600' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  // Turnstile bot check (no-op until TURNSTILE_SECRET_KEY is set)
  const turnstileToken = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (!(await verifyTurnstile(turnstileToken, getClientIp(req.headers)))) {
    return apiError('forbidden', 'Please complete the security check and try again.', requestId);
  }

  const parsed = parseSubmission(form, withoutTurnstileToken(body));
  if (!parsed.ok) return apiError('bad_request', parsed.message, requestId);
  // Honeypot: look successful so a bot doesn't retry.
  if (parsed.bot) return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });

  const { data, error } = await createAdminClient().from('vsyc_form_submissions').insert(submissionRow(form, parsed.answers)).select('id').single();
  if (error || !data) {
    console.error('[forms] insert error:', error);
    return apiError('upstream_error', 'We could not save that. Please try again, or email us.', requestId);
  }

  // Best effort: the answers are saved either way, and the review screen shows them.
  await Promise.allSettled([sendFormNoticeEmail({ formTitle: form.title }, { dedupeKey: `form-notice-${data.id}` })]);

  return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });
});
