import { NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadPlans } from '@/lib/round-plan-server';

/**
 * GET /api/rounds/plan
 *
 * Public: which rounds each division runs, once an organizer has confirmed them (see
 * /api/admin/rounds/plan). A division with no entry runs every round its config lists.
 * Round numbers are positions in the division's configured rounds; skipped ones keep theirs.
 */
export const GET = withErrorHandling(async (requestId) => {
  const { plans, error } = await loadPlans(createAdminClient());
  if (error) return apiError('upstream_error', 'Failed to load round plans', requestId);
  const out = Object.fromEntries(Object.entries(plans).map(([code, p]) => [code, { entrants: p.entrants, rounds: p.rounds }]));
  return NextResponse.json({ plans: out }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } });
});
