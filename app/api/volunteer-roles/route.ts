import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { withErrorHandling } from '@/lib/api-error';
import { getVolunteerRoleAvailability } from '@/lib/volunteer-availability';

/**
 * GET /api/volunteer-roles
 *
 * Public, unauthenticated. Returns the role catalog with confirmed-only fill
 * counts (no applicant PII) — powers the live availability context on the
 * volunteer application form. The dedicated /volunteer/roles page queries
 * the same helper directly server-side rather than calling this route.
 */
export const GET = withErrorHandling(async (requestId, _req: NextRequest) => {
  const roles = await getVolunteerRoleAvailability();
  return NextResponse.json(
    { roles },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
  );
});
