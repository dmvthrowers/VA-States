import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { competition, contest } from '@/contest.config';
import { musicDivisions } from '@/lib/music';
import { listLofiPool } from '@/lib/music-pool';

export const runtime = 'nodejs';

/**
 * GET /api/admin/music-status
 *
 * Music slots per division (paid or free entrants only): how many hold the player's own track,
 * a lo-fi fallback, or nothing yet; plus the deadline and how many lo-fi tracks are in the pool.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const [regsRes, tracksRes] = await Promise.all([
    supabase.from('vsyc_registrations').select('id, divisions, paid, fee_cents'),
    supabase.from('vsyc_music').select('registration_id, division, is_fallback'),
  ]);
  if (regsRes.error || tracksRes.error) {
    console.error('[music-status] load error:', regsRes.error ?? tracksRes.error);
    return apiError('upstream_error', 'Could not load music status.', requestId);
  }

  const hasMusic = (code: string) => competition.divisions.find((d) => d.code === code)?.music === true;
  const entrants = (regsRes.data ?? []).filter((r) => r.paid || r.fee_cents === 0);
  const trackByKey = new Map((tracksRes.data ?? []).map((t) => [`${t.registration_id}:${t.division}`, t]));

  const divisions = competition.divisions.filter((d) => d.music).map((d) => {
    let total = 0, own = 0, fallback = 0;
    for (const r of entrants) {
      if (!musicDivisions(r.divisions as string[], hasMusic).includes(d.code)) continue;
      total++;
      const t = trackByKey.get(`${r.id}:${d.code}`);
      if (t) { if (t.is_fallback) fallback++; else own++; }
    }
    return { code: d.code, name: d.name, entrants: total, own, fallback, empty: total - own - fallback };
  });

  let poolSize: number | null = null;
  try { poolSize = (await listLofiPool(supabase)).length; } catch { /* shown as unknown */ }

  const deadline = new Date(contest.deadlines.musicUpload);
  return NextResponse.json(
    {
      deadline_iso: deadline.toISOString(),
      deadline_label: deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: contest.timeZone }),
      deadline_passed: new Date() > deadline,
      pool_size: poolSize,
      divisions,
    },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
