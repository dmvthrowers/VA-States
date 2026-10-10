import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRunOrderEditorRequest } from '@/lib/auth/admin-request';
import { dayOf } from '@/contest.config';
import { conflictSentence, scheduleConflicts, type ConflictPlayer } from '@/lib/schedule-conflicts';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-conflicts?gap=<minutes>  (master plan D6)
 *
 * Players who are registered (and paid) in two divisions whose planned blocks overlap, or sit closer than `gap`
 * minutes (default 0 = overlaps only; at most 120). Read-only; the same people who run the day can see it
 * (admin, run-order editors, judges). Names are staff-only here.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireRunOrderEditorRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const raw = new URL(req.url).searchParams.get('gap');
  const gap = raw === null ? 0 : Number(raw);
  if (!Number.isInteger(gap) || gap < 0 || gap > 120) return apiError('bad_request', 'gap must be a whole number of minutes from 0 to 120', requestId);

  const { data, error } = await createAdminClient()
    .from('vsyc_registrations')
    .select('id, first_name, last_name, preferred_bracket_name, divisions')
    .eq('paid', true);
  if (error) return apiError('upstream_error', 'Could not load registrations', requestId);

  const players: ConflictPlayer[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.preferred_bracket_name as string | null)?.trim() || `${r.first_name} ${r.last_name}`.trim(),
    divisions: (r.divisions as string[] | null) ?? [],
  }));
  const conflicts = scheduleConflicts(dayOf.schedule, players, gap).map((c) => ({ ...c, sentence: conflictSentence(c) }));
  return NextResponse.json({ gap, conflicts }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } });
});
