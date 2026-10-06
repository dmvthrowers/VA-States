import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { dayOf, type SideEventDef } from '@/contest.config';
import { sideLeaderboard, formatSideValue, type SideEntry, type SideStanding } from '@/lib/schedule-core';

/** Longest leaderboard sent per event. */
const MAX_ROWS = 50;
/** Safety cap on tries read per request (a busy side table logs a few hundred). */
const MAX_ENTRIES = 10000;

export interface SideEventView {
  code: string;
  name: string;
  description: string;
  kind: SideEventDef['kind'];
  better: SideEventDef['better'];
  unit: string;
  timeLimitSeconds: number | null;
  leaderboard: (SideStanding & { value_label: string })[];
  /** People on the board and visible tries in all (the leaderboard itself is capped) */
  people: number;
  tries: number;
  /** Newest visible try, for the overlay's "just in" highlight */
  latest: { id: string; name: string; value: number; value_label: string; created_at: string } | null;
}

/**
 * GET /api/side-events[?code=SLEEPER]
 *
 * Public: every side event in dayOf.sideEvents with its leaderboard (each person's best try;
 * ties share a place). Names are as staff typed them (first name + last initial); there is no
 * registration lookup. Hidden tries are left out. Cached at the edge for 5s.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const code = req.nextUrl.searchParams.get('code');
  const defs = code ? dayOf.sideEvents.filter((e) => e.code === code) : dayOf.sideEvents;
  if (code && defs.length === 0) return apiError('not_found', 'Unknown side event', requestId);

  let rows: (SideEntry & { event_code: string })[] = [];
  if (defs.length) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('vsyc_side_entries')
      .select('id, event_code, name, value, registration_id, created_at')
      .in('event_code', defs.map((d) => d.code))
      .eq('hidden', false)
      .order('created_at', { ascending: true })
      .limit(MAX_ENTRIES);
    if (error) {
      console.error('[side-events] query error:', error);
      return apiError('upstream_error', 'Failed to fetch side events', requestId);
    }
    rows = (data ?? []).map((r) => ({ ...r, value: Number(r.value) }));
  }

  const events: SideEventView[] = defs.map((def) => {
    const mine = rows.filter((r) => r.event_code === def.code);
    const board = sideLeaderboard(mine, def.better);
    const last = mine[mine.length - 1];
    return {
      code: def.code,
      name: def.name,
      description: def.description,
      kind: def.kind,
      better: def.better,
      unit: def.unit,
      timeLimitSeconds: def.timeLimitSeconds ?? null,
      leaderboard: board.slice(0, MAX_ROWS).map((s) => ({ ...s, value_label: formatSideValue(s.best, def) })),
      people: board.length,
      tries: mine.length,
      latest: last
        ? { id: last.id, name: last.name.trim(), value: last.value, value_label: formatSideValue(last.value, def), created_at: last.created_at }
        : null,
    };
  });

  return NextResponse.json({ events }, {
    headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
  });
});
