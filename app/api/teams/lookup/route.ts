import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { entryOf } from '@/lib/divisions-core';
import { JOIN_CODE_RE, findTeamByCode, normalizeJoinCode } from '@/lib/team-entries';
import { divisionByCode } from '@/contest.config';

/**
 * GET /api/teams/lookup?code=ABC123 (public)
 *
 * What a registrant sees before joining a team with its code:
 * { team: { name, division, division_name, members, max } }. A member count only, never
 * member names or emails. Rate-limited so codes can't be enumerated.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const ip = getClientIp(req.headers);
  if (!(await checkRateLimit(ip, 'team_lookup', 30, 10))) {
    return apiError('rate_limited', 'Too many lookups. Try again in a few minutes.', requestId, { 'Retry-After': '600' });
  }

  const code = normalizeJoinCode(req.nextUrl.searchParams.get('code') ?? '');
  if (!JOIN_CODE_RE.test(code)) {
    return apiError('bad_request', 'Join codes are 6 letters or numbers.', requestId);
  }

  const found = await findTeamByCode(createAdminClient(), code);
  if (!found) return apiError('not_found', `No team found with code ${code}.`, requestId);

  const d = divisionByCode(found.team.division);
  const entry = entryOf(d);
  return NextResponse.json(
    {
      team: {
        name: found.team.name,
        division: found.team.division,
        division_name: d?.name ?? found.team.division,
        members: found.members,
        max: entry.type === 'team' ? entry.max : 1,
      },
    },
    { headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } },
  );
});
