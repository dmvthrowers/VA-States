import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { competition, divisionByCode } from '@/contest.config';
import { previewSplit } from '@/lib/division-split';

/**
 * GET /api/admin/division-split[?division=<code>&cut_age=<n>] (admin)
 *
 * Read-only preview of splitting a big division into a younger and an older bracket (site issue
 * #81). For every division with a `split` rule (or just `division`): how many paid entrants, their
 * age spread (age on contest day), whether the rule says to split, and the suggested cut. Pass
 * `cut_age` with `division` to see what a different cut would give. Nothing is saved or applied.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const only = req.nextUrl.searchParams.get('division');
  const cutRaw = req.nextUrl.searchParams.get('cut_age');
  const cut = cutRaw === null || cutRaw === '' ? null : Number(cutRaw);
  if (cut !== null && (!Number.isInteger(cut) || cut < 1 || cut > 120)) {
    return apiError('bad_request', 'cut_age must be a whole number from 1 to 120', requestId);
  }
  if (only && !divisionByCode(only)?.split) return apiError('bad_request', `${only} has no split rule`, requestId);

  const db = createAdminClient();
  const out = [];
  for (const d of competition.divisions.filter((x) => x.split && (!only || x.code === only))) {
    const { data, error } = await db
      .from('vsyc_registrations')
      .select('age_on_event')
      .contains('divisions', [d.code])
      .eq('paid', true);
    if (error) return apiError('upstream_error', `Failed to read entrants for ${d.code}`, requestId);
    const ages = (data ?? []).map((r: { age_on_event: number }) => Number(r.age_on_event)).filter((a) => Number.isFinite(a));
    const byAge: Record<string, number> = {};
    for (const a of ages) byAge[a] = (byAge[a] ?? 0) + 1;
    out.push({
      division: d.code,
      name: d.name,
      labels: d.split!.labels,
      rule: { above: d.split!.above, min_bracket: d.split!.minBracket },
      by_age: byAge,
      preview: previewSplit(ages, d.split!, only === d.code ? cut : null),
    });
  }
  return NextResponse.json({ divisions: out }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } });
});
