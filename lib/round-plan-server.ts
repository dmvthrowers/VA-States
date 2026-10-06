/**
 * Round plans from the database (server only): the confirmed plan for each division, and how many
 * entered, which is what a suggestion is based on. The rules are in lib/round-plan.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { divisionByCode } from '@/contest.config';
import { isTeamDivision } from '@/lib/divisions-core';
import type { RoundPlan } from '@/lib/round-plan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>;

interface PlanRow {
  division: string;
  entrants: number;
  tier: number;
  rounds: { round: number; key: string; advance?: number | null }[];
  confirmed_by: string | null;
  confirmed_at: string;
}

const toPlan = (r: PlanRow): RoundPlan => ({
  entrants: r.entrants,
  tier: r.tier,
  rounds: (r.rounds ?? []).map((x) => ({ round: Number(x.round), key: String(x.key), advance: x.advance ?? null })),
});

/** Every confirmed plan, by division code. */
export async function loadPlans(db: Db): Promise<{ plans: Record<string, RoundPlan & { confirmed_by: string | null; confirmed_at: string }>; error: unknown }> {
  const { data, error } = await db.from('vsyc_round_plans').select('division, entrants, tier, rounds, confirmed_by, confirmed_at');
  const plans: Record<string, RoundPlan & { confirmed_by: string | null; confirmed_at: string }> = {};
  for (const r of (data ?? []) as PlanRow[]) plans[r.division] = { ...toPlan(r), confirmed_by: r.confirmed_by, confirmed_at: r.confirmed_at };
  return { plans, error };
}

/** The confirmed plan for one division, or null (every configured round runs). */
export async function loadPlan(db: Db, division: string): Promise<RoundPlan | null> {
  const { data } = await db.from('vsyc_round_plans').select('division, entrants, tier, rounds, confirmed_by, confirmed_at').eq('division', division).maybeSingle();
  return data ? toPlan(data as PlanRow) : null;
}

/**
 * How many entered a division: paid registrations that list it, or teams in a team division
 * (a captain's registration stands for the team).
 */
export async function countEntrants(db: Db, division: string): Promise<number | null> {
  if (isTeamDivision(divisionByCode(division))) {
    const { count, error } = await db.from('vsyc_teams').select('id', { count: 'exact', head: true }).eq('division', division);
    return error ? null : count ?? 0;
  }
  const { count, error } = await db
    .from('vsyc_registrations')
    .select('id', { count: 'exact', head: true })
    .contains('divisions', [division])
    .eq('paid', true);
  return error ? null : count ?? 0;
}
