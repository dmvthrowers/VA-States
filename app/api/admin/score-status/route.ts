import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { DIVISION_CODES, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { loadScoreStatus } from '@/lib/score-status-server';

/**
 * GET /api/admin/score-status?division=<code>&round=<n>   (admin or judge)
 *
 * Live status of one round's judging (site issue #83): per competitor, who has scored them and who
 * hasn't, the median and spread, and scores far from the judges' median; plus a "ready to publish"
 * verdict with the blockers and warnings behind it. Read-only. Staff see full names, so it's never cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);
  const identity = await getStaffIdentityFromToken(token);
  if (!identity?.isActive || !['admin', 'judge'].includes(identity.role)) {
    return apiError('forbidden', 'Admin or judge access required', requestId);
  }

  const division = req.nextUrl.searchParams.get('division');
  if (!division || !DIVISION_CODES.includes(division)) {
    return apiError('bad_request', `division must be one of: ${DIVISION_CODES.join(', ')}`, requestId);
  }
  const def = divisionByCode(division)!;
  const roundParam = req.nextUrl.searchParams.get('round');
  const round = roundParam === null || roundParam === '' ? 1 : Number(roundParam);
  if (!Number.isInteger(round) || round < 1 || round > roundsOf(def).length) {
    return apiError('bad_request', `round must be 1–${roundsOf(def).length} for ${division}`, requestId);
  }
  const loaded = await loadScoreStatus(createAdminClient(), division, round);
  if (!loaded.ok) {
    return loaded.reason === 'not_scored'
      ? apiError('bad_request', `${def.name} isn't scored on a score sheet`, requestId)
      : apiError('upstream_error', 'Failed to load the scores', requestId);
  }
  const status = loaded.status;
  return NextResponse.json(
    { division, round, round_name: roundsOf(def)[round - 1].name, ...status },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
