import { NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildScheduleFeed } from '@/lib/schedule-feed';

/**
 * GET /api/schedule (public) → { timeZone, now, items, now_items, next }
 *
 * The day's blocks from contest.config.ts → dayOf.schedule with estimated times that move with
 * the real ones (lib/schedule-core.ts → liveSchedule). Each block on now that judges a division
 * also carries its live run order: who's on stage, the next two on deck, and done/total. Names
 * are the privacy-safe public ones GET /api/run-order gives anonymous viewers.
 * See docs/FORMATS.md → Live schedule.
 */
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (requestId) => {
  let feed;
  try {
    feed = await buildScheduleFeed(createAdminClient());
  } catch (e) {
    console.error('[schedule] feed error:', e);
    return apiError('upstream_error', 'Failed to load the schedule', requestId);
  }
  return NextResponse.json(feed, {
    headers: { 'x-request-id': requestId, 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
  });
});
