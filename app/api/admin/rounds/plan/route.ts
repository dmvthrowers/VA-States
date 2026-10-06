import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { competition, divisionByCode } from '@/contest.config';
import { roundsOf } from '@/lib/divisions-core';
import { planFromTier, suggestPlan, describeRoundPlan } from '@/lib/round-plan';
import { countEntrants, loadPlans } from '@/lib/round-plan-server';

/**
 * GET /api/admin/rounds/plan (admin)
 *
 * For each division that has a `roundPlan` in contest.config.ts: how many entered, the plan that
 * count suggests, the plan an organizer has confirmed (if any), and whether they differ (more or
 * fewer people entered since it was confirmed).
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const db = createAdminClient();
  const { plans, error } = await loadPlans(db);
  if (error) return apiError('upstream_error', 'Failed to load round plans', requestId);

  const out = [];
  for (const d of competition.divisions.filter((x) => x.roundPlan?.length)) {
    const entrants = await countEntrants(db, d.code);
    if (entrants === null) return apiError('upstream_error', `Failed to count entrants in ${d.code}`, requestId);
    const suggested = suggestPlan(d, entrants);
    const confirmed = plans[d.code] ?? null;
    const names = roundsOf(d).map((r) => r.name);
    out.push({
      division: d.code,
      name: d.name,
      round_names: names,
      rules: describeRoundPlan(d),
      entrants,
      suggested,
      confirmed,
      // Someone entered or withdrew since the plan was confirmed, and it would now land in a different tier.
      stale: !!confirmed && !!suggested && confirmed.tier !== suggested.tier,
    });
  }
  return NextResponse.json({ divisions: out }, { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } });
});

const schema = z.object({
  division: z.string().trim(),
  /** Use this tier instead of the one the entrant count suggests (an organizer's call). */
  tier: z.number().int().min(0).max(10).optional(),
});

/**
 * POST /api/admin/rounds/plan (admin)
 *
 * Body: { division, tier? }. Confirms the suggested plan (or the chosen tier) for a division.
 * Nothing changes for a division until it's confirmed here. Refused (409) if the new plan would
 * skip a round that already has scores.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);

  const def = divisionByCode(parsed.data.division);
  if (!def?.roundPlan?.length) return apiError('bad_request', `${parsed.data.division} has no round plan`, requestId);
  const db = createAdminClient();
  const entrants = await countEntrants(db, def.code);
  if (entrants === null) return apiError('upstream_error', 'Failed to count entrants', requestId);

  const plan = parsed.data.tier === undefined ? suggestPlan(def, entrants) : planFromTier(def, parsed.data.tier, entrants);
  if (!plan) return apiError('bad_request', `${def.code} has no tier ${parsed.data.tier}`, requestId);

  const { data: scored, error: scoredError } = await db.from('vsyc_scores').select('round').eq('division', def.code);
  if (scoredError) return apiError('upstream_error', 'Failed to check scores', requestId);
  const running = new Set(plan.rounds.map((r) => r.round));
  const skipped = [...new Set((scored ?? []).map((s: { round: number }) => Number(s.round)))].filter((r) => !running.has(r));
  if (skipped.length) {
    const names = roundsOf(def);
    return apiError('conflict', `That plan skips ${skipped.map((r) => names[r - 1]?.name ?? `round ${r}`).join(', ')}, which already has scores.`, requestId);
  }

  const { error } = await db.from('vsyc_round_plans').upsert({
    division: def.code,
    entrants,
    tier: plan.tier,
    rounds: plan.rounds,
    confirmed_by: auth.email,
    confirmed_at: new Date().toISOString(),
  }, { onConflict: 'division' });
  if (error) {
    console.error('[admin/rounds/plan] save error:', error);
    return apiError('upstream_error', 'Failed to save the round plan', requestId);
  }
  await logAudit('round_plan_confirmed', { actor: auth.email, details: { division: def.code, entrants, tier: plan.tier, rounds: plan.rounds } });
  return NextResponse.json({ ok: true, division: def.code, plan }, { headers: { 'x-request-id': requestId } });
});
