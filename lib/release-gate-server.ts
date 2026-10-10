import type { SupabaseClient } from '@supabase/supabase-js';
import { dayOf } from '@/contest.config';
import { evaluateReleaseGate, type GateVerdict, type ReleaseCheck } from '@/lib/release-gate';
import { loadScoreStatus } from '@/lib/score-status-server';
import type { ScoreStatus } from '@/lib/score-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, 'public', any>;

export type GateResult =
  | { ok: true; verdict: GateVerdict; status: ScoreStatus | null; check: ReleaseCheck | null }
  | { ok: false };

/**
 * Reads a round's scores and its head-judge check and rules on the gate. Fails closed: if either
 * read errors and gates are on, the caller must not release.
 */
export async function gateFor(db: AnyClient, division: string, round: number): Promise<GateResult> {
  const enabled = dayOf.releaseGates === true;
  const [loaded, checkRes] = await Promise.all([
    loadScoreStatus(db, division, round),
    db.from('vsyc_release_checks').select('checked_by, checked_at, fingerprint').eq('division', division).eq('round', round).maybeSingle(),
  ]);
  if (checkRes.error) {
    console.error('[release-gate] check read error:', checkRes.error);
    return { ok: false };
  }
  const status = loaded.ok ? loaded.status : null;
  // A division that isn't scored on a score sheet (a bracket, say) has nothing to check: don't hold it.
  if (!loaded.ok && loaded.reason === 'not_scored') {
    return { ok: true, verdict: { open: true, reasons: [], checked: false }, status: null, check: null };
  }
  const check = (checkRes.data ?? null) as ReleaseCheck | null;
  return { ok: true, verdict: evaluateReleaseGate({ enabled, status, check }), status, check };
}
