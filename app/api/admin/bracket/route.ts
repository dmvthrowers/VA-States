import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { buildBracket, isTeamDivision } from '@/lib/divisions-core';
import { bracketRows, hasRealWinner, seedEntrants, type EntrantCandidate } from '@/lib/bracket-store';
import { bracketDivision, loadMatches } from '@/lib/bracket-server';

const schema = z.object({
  division: z.string().trim().max(20),
  action: z.enum(['generate', 'reset']),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/admin/bracket — admin only.
 *
 * `{ division, action: 'generate', force? }` builds the whole bracket (every round, plus the
 * third-place match when configured) from the paid entrants, seeded by the division's config:
 * a secure random draw or registration order. Team divisions enter one row per team (the
 * captain). Refused once a judged winner is recorded unless `force: true`.
 *
 * `{ division, action: 'reset' }` deletes the bracket (and its votes).
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError('bad_request', 'Invalid JSON body', requestId); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('bad_request', parsed.error.issues[0]?.message ?? 'Validation failed', requestId);
  const { division, action, force } = parsed.data;
  const bd = bracketDivision(division);
  if (!bd) return apiError('bad_request', 'division must be a bracket division', requestId);

  const supabase = createAdminClient();
  const { rows: existing, error: exErr } = await loadMatches(supabase, division);
  if (exErr) return apiError('upstream_error', 'Failed to load bracket', requestId);

  if (action === 'reset') {
    const { error } = await supabase.from('vsyc_bracket_matches').delete().eq('division', division);
    if (error) return apiError('upstream_error', 'Failed to reset bracket', requestId);
    await logAudit('bracket_reset', { actor: auth.email, details: { division, matches: existing.length } });
    return NextResponse.json({ ok: true, division, matches: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (!force && existing.some(hasRealWinner)) {
    return apiError('conflict', 'This bracket already has results. Reset it, or regenerate with force.', requestId);
  }

  // Entrants: paid registrations in the division; in team divisions only team captains.
  const { data: regs, error: regErr } = await supabase
    .from('vsyc_registrations')
    .select('id, created_at')
    .eq('paid', true)
    .contains('divisions', [division]);
  if (regErr) return apiError('upstream_error', 'Failed to load entrants', requestId);
  let candidates: EntrantCandidate[] = (regs ?? []).map((r) => ({ registration_id: r.id, created_at: r.created_at }));
  if (isTeamDivision(bd.def)) {
    const { data: teams, error: tErr } = await supabase
      .from('vsyc_teams')
      .select('captain_registration_id')
      .eq('division', division);
    if (tErr) return apiError('upstream_error', 'Failed to load teams', requestId);
    const captains = new Set((teams ?? []).map((t) => t.captain_registration_id));
    candidates = candidates.filter((c) => captains.has(c.registration_id));
  }
  if (candidates.length < 2) {
    return apiError('unprocessable', `A bracket needs at least 2 paid entrants (found ${candidates.length})`, requestId);
  }

  const seeds = seedEntrants(candidates, bd.scoring.seeding);
  const rows = bracketRows(division, buildBracket(seeds, bd.scoring.thirdPlaceMatch));

  if (existing.length) {
    const { error } = await supabase.from('vsyc_bracket_matches').delete().eq('division', division);
    if (error) return apiError('upstream_error', 'Failed to clear the old bracket', requestId);
  }
  // One multi-row insert: all or nothing. A concurrent generate trips the unique
  // (division, round, position, is_third_place) key and gets a conflict instead of a mixed bracket.
  const { error: insErr } = await supabase.from('vsyc_bracket_matches').insert(rows);
  if (insErr) {
    console.error('[admin/bracket] insert error:', insErr);
    if (insErr.code === '23505') return apiError('conflict', 'Someone else generated this bracket at the same time. Reload.', requestId);
    return apiError('upstream_error', 'Failed to save bracket', requestId);
  }
  await logAudit('bracket_generate', {
    actor: auth.email,
    details: { division, entrants: seeds.length, seeding: bd.scoring.seeding, forced: force && existing.some(hasRealWinner) },
  });

  const { rows: saved } = await loadMatches(supabase, division);
  return NextResponse.json(
    { ok: true, division, entrants: seeds.length, matches: saved },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
