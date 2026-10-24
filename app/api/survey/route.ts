import { NextRequest, NextResponse } from 'next/server';
import { z } from '@/lib/zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { SURVEY_SOURCES, SURVEY_TYPES, validateSurveyAnswers } from '@/lib/surveys';

const bodySchema = z.object({
  survey_type: z.enum(SURVEY_TYPES),
  source: z.enum(SURVEY_SOURCES).optional(),
  answers: z.record(z.string(), z.unknown()),
  contact_name: z.string().trim().max(120).optional().or(z.literal('')),
  contact_email: z.string().trim().email('Enter a valid email or leave it blank').max(254).optional().or(z.literal('')),
  allow_quote: z.boolean().optional(),
  quote_text: z.string().trim().max(1000).optional().or(z.literal('')),
  _hp: z.string().optional(),
});

/**
 * POST /api/survey
 *
 * Public, unauthenticated submission endpoint for the post-event feedback
 * surveys (/survey/[type]). Answers are validated against lib/surveys.ts so
 * only known questions and exact option values are stored.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  // 1. Rate limit — 8 submissions per IP per hour. Families on shared wifi
  //    may fill several surveys; bots should not fill hundreds.
  const ip = getClientIp(req.headers);
  const allowed = await checkRateLimit(ip, 'survey', 8, 60);
  if (!allowed) {
    return apiError('rate_limited', 'Too many submissions from this network. Try again later.', requestId, {
      'Retry-After': '3600',
    });
  }

  // 2. Parse
  let body: unknown;
  try { body = await req.json(); } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  }
  const data = parsed.data;

  // 3. Honeypot — pretend success so bots don't retry
  if (data._hp) {
    return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });
  }

  // 4. Validate answers against the survey definition
  const result = validateSurveyAnswers(data.survey_type, data.answers);
  if (!result.ok) {
    return apiError('bad_request', result.error, requestId);
  }

  // Opting into updates is useless without somewhere to send them.
  const optIns = result.answers.keep_me_posted;
  if (Array.isArray(optIns) && optIns.length > 0 && !data.contact_email) {
    return apiError('bad_request', 'Add your email in Follow-Up so we can send you those updates.', requestId);
  }

  const allowQuote = data.allow_quote === true;

  const supabase = createAdminClient();
  const { error } = await supabase.from('vsyc26_survey_responses').insert({
    survey_type: data.survey_type,
    source: data.source ?? 'direct',
    answers: result.answers,
    contact_name: data.contact_name || null,
    contact_email: data.contact_email ? data.contact_email.toLowerCase() : null,
    allow_quote: allowQuote,
    quote_text: allowQuote ? data.quote_text || null : null,
  });

  if (error) {
    console.error('[survey] insert error:', error);
    return apiError('upstream_error', 'Failed to save your answers. Please try again.', requestId);
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: { 'x-request-id': requestId } });
});
