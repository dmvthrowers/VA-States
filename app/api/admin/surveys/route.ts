import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCapabilityRequest } from '@/lib/auth/admin-request';

/**
 * GET /api/admin/surveys
 *
 * Every post-event survey response, newest first, for the admin Surveys tab.
 * Aggregation happens client-side (components/SurveyResults.tsx) — response
 * volume for a single contest is small. Includes optional contact details,
 * so admin-only.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireCapabilityRequest(req, requestId, 'players.view_private');
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc26_survey_responses')
    .select('id, created_at, survey_type, source, answers, contact_name, contact_email, allow_quote, quote_text')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return apiError('upstream_error', `Failed to load survey responses: ${error.message}`, requestId);
  }

  return NextResponse.json({ responses: data ?? [] }, { headers: { 'x-request-id': requestId } });
});
