import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCapabilityRequest } from '@/lib/auth/admin-request';
import { contest } from '@/contest.config';
import { doNotPhotograph, type ConsentRow } from '@/lib/media-consent';

/**
 * GET /api/staff/media-consent   (media.upload or media.publish; admin holds both)
 *
 * The "do not photograph" list for the media team: paid entrants and volunteers who left the photo and
 * video release empty (a guardian's choice for minors). Only meaningful when contest.photoConsent is
 * 'optional'; when the release is required, everyone has agreed and the list is empty. Staff see full names, never cached.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireCapabilityRequest(req, requestId, 'media.upload', 'media.publish');
  if (auth instanceof NextResponse) return auth;

  const db = createAdminClient();
  const [regRes, volRes] = await Promise.all([
    db.from('vsyc_registrations').select('first_name, last_name, is_minor, divisions, photo_video_consent').eq('paid', true).eq('photo_video_consent', false),
    db.from('vsyc_volunteers').select('first_name, last_name, photo_video_consent').eq('photo_video_consent', false),
  ]);
  if (regRes.error || volRes.error) {
    console.error('[staff/media-consent] query error:', regRes.error ?? volRes.error);
    return apiError('upstream_error', 'Failed to load the list', requestId);
  }

  const rows: ConsentRow[] = [
    ...(regRes.data ?? []).map((r) => ({
      name: `${r.first_name} ${r.last_name}`.trim(), kind: 'competitor' as const, is_minor: !!r.is_minor,
      divisions: (r.divisions as string[] | null) ?? [], photo_video_consent: !!r.photo_video_consent,
    })),
    ...(volRes.data ?? []).map((r) => ({
      name: `${r.first_name} ${r.last_name}`.trim(), kind: 'volunteer' as const, is_minor: false,
      divisions: [], photo_video_consent: !!r.photo_video_consent,
    })),
  ];
  return NextResponse.json(
    { photo_consent: contest.photoConsent, people: doNotPhotograph(rows) },
    { headers: { 'x-request-id': requestId, 'Cache-Control': 'private, no-store' } },
  );
});
