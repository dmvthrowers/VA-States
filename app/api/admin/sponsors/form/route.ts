import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { normalizeSettings, renamedTiers } from '@/lib/sponsor-settings';
import { defaultSettings, loadSponsorSettings } from '@/lib/sponsor-settings-server';

const noStore = (requestId: string) => ({ 'x-request-id': requestId, 'Cache-Control': 'no-store' });

/** GET /api/admin/sponsors/form: the settings in use, the config defaults, and whether they have been customized. */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { settings, customized } = await loadSponsorSettings();
  return NextResponse.json({ settings, defaults: defaultSettings(), customized }, { headers: noStore(requestId) });
});

/**
 * PUT /api/admin/sponsors/form  { settings }
 * Saves the form settings. Renaming a tier (same id, new name) also renames it on sponsors already placed at
 * it, so slot counts keep working. Needs `sponsors.manage`.
 */
export const PUT = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  let json: { settings?: unknown };
  try {
    json = await req.json();
  } catch {
    return apiError('bad_request', 'Invalid JSON body', requestId);
  }
  let next;
  try {
    next = normalizeSettings(json.settings);
  } catch (e) {
    const msg = e instanceof ZodError ? (e.issues[0]?.message ?? 'Check the settings.') : e instanceof Error ? e.message : 'Check the settings.';
    return apiError('bad_request', msg, requestId);
  }

  const db = createAdminClient();
  const { settings: prev } = await loadSponsorSettings();
  const { error } = await db.from('vsyc_sponsor_form').upsert({ id: true, settings: next, updated_at: new Date().toISOString(), updated_by: auth.authUserId });
  if (error) return apiError('upstream_error', 'Could not save the settings', requestId);

  // Move sponsors along with a renamed tier. Matching is by name, ignoring case, like the slot count.
  const renames = renamedTiers(prev.tiers, next.tiers);
  if (renames.length) {
    const { data: rows } = await db.from('vsyc_sponsors').select('id, tier');
    for (const r of renames) {
      const ids = (rows ?? []).filter((s) => s.tier?.trim().toLowerCase() === r.from.toLowerCase()).map((s) => s.id);
      if (ids.length) await db.from('vsyc_sponsors').update({ tier: r.to }).in('id', ids);
    }
  }
  return NextResponse.json({ ok: true, settings: next }, { headers: noStore(requestId) });
});

/** DELETE /api/admin/sponsors/form: forget the saved copy and go back to the config defaults. */
export const DELETE = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;
  const { error } = await createAdminClient().from('vsyc_sponsor_form').delete().eq('id', true);
  if (error) return apiError('upstream_error', 'Could not reset the settings', requestId);
  return NextResponse.json({ ok: true }, { headers: noStore(requestId) });
});
