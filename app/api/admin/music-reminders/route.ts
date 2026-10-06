import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { contest, divisionByCode } from '@/contest.config';
import type { OutboxEmail } from '@/lib/email';
import { enqueueEmails } from '@/lib/outbox';
import { emptySlotsByPlayer } from '@/lib/music';
import { listLofiPool } from '@/lib/music-pool';

export const runtime = 'nodejs';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/**
 * POST /api/admin/music-reminders  { dry_run?: boolean (default true) }
 *
 * Emails every paid (or free) entrant who still has an empty music slot, listing the divisions
 * that need a track and their upload link (parents are copied for minors). Before the music
 * deadline only. At most one reminder per person per day for the same set of divisions, so
 * pressing it twice doesn't email anyone twice. `dry_run` (the default) just reports who would
 * get one.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { dry_run?: unknown };
  const dryRun = body.dry_run !== false;

  const deadline = new Date(contest.deadlines.musicUpload);
  if (!dryRun && new Date() > deadline) {
    return apiError('unprocessable', 'The music deadline has passed, so reminders would be too late. Use the lo-fi fallback instead.', requestId);
  }
  const deadlineLabel = deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: contest.timeZone });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: contest.timeZone }); // YYYY-MM-DD

  const supabase = createAdminClient();
  const [regsRes, tracksRes] = await Promise.all([
    supabase
      .from('vsyc_registrations')
      .select('id, email, first_name, last_name, divisions, paid, fee_cents, music_upload_token, is_minor, parent_email'),
    supabase.from('vsyc_music').select('registration_id, division'),
  ]);
  if (regsRes.error || tracksRes.error) {
    console.error('[music-reminders] load error:', regsRes.error ?? tracksRes.error);
    return apiError('upstream_error', 'Could not load registrations.', requestId);
  }

  const entrants = (regsRes.data ?? []).filter((r) => (r.paid || r.fee_cents === 0) && r.music_upload_token);
  const empty = emptySlotsByPlayer(
    entrants.map((r) => ({ id: r.id, divisions: r.divisions as string[] })),
    tracksRes.data ?? [],
    (code) => divisionByCode(code)?.music === true,
  );
  const byId = new Map(entrants.map((r) => [r.id, r]));

  // Only promise a lo-fi track when there is a pool to draw from.
  let lofiFallback = false;
  try {
    lofiFallback = (await listLofiPool(supabase)).length > 0;
  } catch {
    // Not fatal: the reminder just doesn't mention it.
  }

  const emails: OutboxEmail[] = [];
  const dedupeKeys: string[] = [];
  const recipients: { name: string; divisions: string[] }[] = [];
  for (const e of empty) {
    const reg = byId.get(e.id)!;
    const parent = reg.is_minor && reg.parent_email && reg.parent_email !== reg.email ? [reg.parent_email] : undefined;
    emails.push({
      template: 'music_reminder',
      params: {
        to: reg.email,
        cc: parent,
        firstName: reg.first_name,
        divisions: e.divisions,
        uploadUrl: `${BASE_URL}/upload?token=${reg.music_upload_token}`,
        deadlineLabel,
        lofiFallback,
      },
    });
    dedupeKeys.push(`music_reminder:${reg.id}:${today}:${e.divisions.join('+')}`);
    recipients.push({ name: `${reg.first_name} ${reg.last_name}`, divisions: e.divisions });
  }

  if (dryRun || emails.length === 0) {
    return NextResponse.json(
      { dry_run: dryRun, recipients: recipients.length, lofi_fallback: lofiFallback, people: recipients, queued: 0, skipped: 0 },
      { headers: { 'x-request-id': requestId } },
    );
  }

  const { queued, skipped, failed } = await enqueueEmails(emails, { priority: 2, dedupeKeys });
  await logAudit('music_reminders_queued', {
    actor: 'admin',
    details: { recipients: recipients.length, queued, skipped, failed: failed.length },
  });

  return NextResponse.json(
    { dry_run: false, recipients: recipients.length, lofi_fallback: lofiFallback, people: recipients, queued, skipped, failed: failed.length },
    { headers: { 'x-request-id': requestId } },
  );
});
