import type { SupabaseClient } from '@supabase/supabase-js';
import { contest, dayOf, divisionByCode, zonedDate } from '@/contest.config';
import { liveSchedule, nowAndNext, type ScheduleState } from '@/lib/schedule-core';
import { feedItem, runOrderSnapshot, type RunOrderNameRow, type RunOrderSnapshot, type ScheduleFeed } from '@/lib/schedule-feed-core';
import { isPublished, publishedDivisions } from '@/lib/results-visibility';
import { runOrderDisplayName, type DisplayNameParts } from '@/lib/display-name';
import { isTeamDivision } from '@/lib/divisions-core';

export type { ScheduleFeed } from '@/lib/schedule-feed-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;

const REGISTRATION_FIELDS = 'id, first_name, last_name, preferred_bracket_name, nickname, is_minor, is_public, division_styles';

type RegistrationRow = DisplayNameParts & { id: string; division_styles: Record<string, string[]> | null };

/** Every block's saved state (vsyc_schedule_state). Throws on a database error. */
export async function loadScheduleStates(supabase: AnyClient): Promise<ScheduleState[]> {
  const { data, error } = await supabase
    .from('vsyc_schedule_state')
    .select('item_id, status, started_at, ended_at, published_at');
  if (error) throw new Error(`vsyc_schedule_state: ${error.message}`);
  return (data ?? []) as ScheduleState[];
}

/**
 * The explicit run order for one round with public names, exactly as GET /api/run-order shows
 * anonymous viewers: minors who aren't opted in get a handle or first name + last initial, and
 * team divisions show the team name. Null when no run order has been set (or on an error: the
 * schedule still renders without it).
 */
export async function liveRunOrder(supabase: AnyClient, division: string, round: number): Promise<RunOrderSnapshot | null> {
  const [orderRes, teamRes] = await Promise.all([
    supabase
      .from('vsyc_run_order')
      .select(`position, status, registration_id, vsyc_registrations (${REGISTRATION_FIELDS})`)
      .eq('division', division)
      .eq('round', round)
      .order('position', { ascending: true }),
    isTeamDivision(divisionByCode(division))
      ? supabase.from('vsyc_teams').select('name, captain_registration_id').eq('division', division)
      : Promise.resolve({ data: [] as { name: string; captain_registration_id: string }[], error: null }),
  ]);
  if (orderRes.error) {
    console.error('[schedule] run order query error:', orderRes.error.message);
    return null;
  }
  if (teamRes.error) console.error('[schedule] teams query error:', teamRes.error.message);
  const rows = orderRes.data ?? [];
  if (rows.length === 0) return null;

  const teamNames = new Map(((teamRes.data ?? []) as { name: string; captain_registration_id: string }[])
    .map((t) => [t.captain_registration_id, t.name]));
  const named: RunOrderNameRow[] = rows.map((row) => {
    const reg = (Array.isArray(row.vsyc_registrations) ? row.vsyc_registrations[0] : row.vsyc_registrations) as RegistrationRow | null;
    return {
      position: row.position,
      status: row.status,
      display_name: teamNames.get(row.registration_id) || (reg ? runOrderDisplayName(reg, false) : 'Unnamed competitor'),
      style: reg?.division_styles?.[division]?.join(', ') || null,
    };
  });
  return runOrderSnapshot(division, round, named);
}

/** The whole live schedule: estimated times, what's on now (with its run order) and what's next. */
export async function buildScheduleFeed(supabase: AnyClient, now = new Date()): Promise<ScheduleFeed> {
  const [states, vis] = await Promise.all([loadScheduleStates(supabase), publishedDivisions(supabase)]);
  const live = liveSchedule(
    dayOf.schedule, states, now, (hhmm) => zonedDate(contest.date, hhmm, contest.timeZone), dayOf.allowEarlyStarts,
  );
  const out = (i: (typeof live)[number]) => feedItem(i, !!i.division && isPublished(vis, i.division, i.round ?? 1));
  const { now: nowItems, next } = nowAndNext(live);
  const now_items = await Promise.all(nowItems.map(async (i) => ({
    ...out(i),
    run_order: i.division ? await liveRunOrder(supabase, i.division, i.round ?? 1) : null,
  })));
  return {
    timeZone: contest.timeZone,
    now: now.toISOString(),
    items: live.map(out),
    now_items,
    next: next ? out(next) : null,
  };
}
