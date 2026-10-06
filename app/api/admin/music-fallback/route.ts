import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { contest } from '@/contest.config';
import { emptySlotsByPlayer, lofiDisplayName, planFallbacks } from '@/lib/music';
import { divisionName, slotLabel, slotsOf } from '@/lib/music-config';
import { listLofiPool } from '@/lib/music-pool';

export const runtime = 'nodejs';

/**
 * POST /api/admin/music-fallback  { dry_run?: boolean (default true), force?: boolean }
 *
 * Gives every empty music slot (paid or free entrant: one per track a division asks for) a
 * random track from the lo-fi pool in `vsyc26-music/lofi/`, so nobody walks on to silence. The
 * assignment shows up as "LO-FI (no upload)" on the DJ queue, run order and the player's page,
 * and a player who uploads their own track replaces it. Never touches a slot that already has a
 * track, and running it twice assigns nothing new.
 *
 * Only after the music deadline, unless `force: true`. `dry_run` (the default) just reports.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { dry_run?: unknown; force?: unknown };
  const dryRun = body.dry_run !== false;
  const pastDeadline = new Date() > new Date(contest.deadlines.musicUpload);
  if (!dryRun && !pastDeadline && body.force !== true) {
    return apiError('unprocessable', 'The music deadline has not passed yet. Pass force: true to assign lo-fi tracks now.', requestId);
  }

  const supabase = createAdminClient();

  let pool: string[];
  try {
    pool = await listLofiPool(supabase);
  } catch (e) {
    console.error('[music-fallback] pool listing failed:', e);
    return apiError('upstream_error', 'Could not read the lo-fi folder.', requestId);
  }
  if (pool.length === 0) {
    return apiError('unprocessable', 'No lo-fi tracks found. Upload mp3/wav/m4a files to the lofi/ folder of the vsyc26-music bucket first.', requestId);
  }

  const [regsRes, tracksRes] = await Promise.all([
    supabase.from('vsyc_registrations').select('id, first_name, last_name, divisions, paid, fee_cents'),
    supabase.from('vsyc_music').select('registration_id, division, slot'),
  ]);
  if (regsRes.error || tracksRes.error) {
    console.error('[music-fallback] load error:', regsRes.error ?? tracksRes.error);
    return apiError('upstream_error', 'Could not load registrations.', requestId);
  }

  const entrants = (regsRes.data ?? []).filter((r) => r.paid || r.fee_cents === 0);
  const empty = emptySlotsByPlayer(
    entrants.map((r) => ({ id: r.id, divisions: r.divisions as string[] })),
    tracksRes.data ?? [],
    slotsOf,
  );
  const plan = planFallbacks(empty, pool);
  const nameOf = new Map(entrants.map((r) => [r.id, `${r.first_name} ${r.last_name}`]));

  const summary = {
    dry_run: dryRun,
    past_deadline: pastDeadline,
    pool_size: pool.length,
    empty_slots: plan.length,
    slots: plan.map((p) => ({ name: nameOf.get(p.registration_id) ?? p.registration_id, division: p.division, slot: p.slot, label: `${divisionName(p.division)} · ${slotLabel(p.division, p.slot)}`, track: lofiDisplayName(p.object_name) })),
  };
  if (dryRun || plan.length === 0) {
    return NextResponse.json({ ...summary, assigned: 0 }, { headers: { 'x-request-id': requestId } });
  }

  // ignoreDuplicates: a track that landed since we looked is never overwritten.
  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from('vsyc_music')
    .upsert(
      plan.map((p) => ({
        registration_id: p.registration_id,
        division: p.division,
        slot: p.slot,
        object_name: p.object_name,
        filename: lofiDisplayName(p.object_name),
        source: 'fallback',
        uploaded_at: now,
      })),
      { onConflict: 'registration_id,division,slot', ignoreDuplicates: true },
    )
    .select('registration_id, division, slot, object_name');
  if (error) {
    console.error('[music-fallback] insert error:', error);
    return apiError('upstream_error', 'Could not assign the lo-fi tracks.', requestId);
  }

  for (const row of inserted ?? []) {
    await logAudit('music_fallback_assigned', {
      registrationId: row.registration_id,
      actor: 'admin',
      details: { division: row.division, slot: row.slot, track: row.object_name, forced: !pastDeadline },
    });
  }

  return NextResponse.json({ ...summary, assigned: inserted?.length ?? 0 }, { headers: { 'x-request-id': requestId } });
});
