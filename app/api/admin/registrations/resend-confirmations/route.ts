import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest as requireAdmin } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import type { OutboxEmail } from '@/lib/email';
import { enqueueEmails } from '@/lib/outbox';
import { fetchAllTeamMemberships, type TeamSummary } from '@/lib/team-entries';
import { competition } from '@/contest.config';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

/**
 * POST /api/admin/registrations/resend-confirmations
 *
 * Queues the registration confirmation email (magic link, payment status,
 * music upload link) to every competitor registration on file — and to the
 * parent email for any minor. Uses each registration's already-issued
 * music_upload_token, does not generate new tokens or IDs. Already-paid
 * registrants get the payment-required block suppressed so the resend
 * doesn't ask them to pay again.
 *
 * Body: { dryRun?: boolean } — dryRun returns the recipient list/count
 * without queueing anything.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdmin(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const supabase = createAdminClient();
  const { data: registrations, error } = await supabase
    .from('vsyc_registrations')
    .select(
      'id, email, first_name, last_name, divisions, fee_cents, paid, music_upload_token, age_on_event, parent_email'
    );

  if (error) {
    return apiError('upstream_error', `Failed to load registrations: ${error.message}`, requestId);
  }

  const rows = registrations ?? [];

  // Teams each registrant is on, so captains get their join code again (best-effort: the
  // resend still goes out without them).
  let teamsByReg: Record<string, TeamSummary[]> = {};
  try {
    teamsByReg = await fetchAllTeamMemberships(supabase, competition);
  } catch (e) {
    console.error('[resend-confirmations] teams lookup failed:', e);
  }

  if (dryRun) {
    return NextResponse.json(
      {
        ok: true,
        dryRun: true,
        total: rows.length,
        recipients: rows.map((r) => ({ id: r.id, email: r.email, isMinor: r.age_on_event < 18 })),
      },
      { headers: { 'x-request-id': requestId } }
    );
  }

  // Bulk email: queued at priority 2 so the outbox sends it within the daily
  // limit shared with the YoYo Map; anything over today's limit goes out
  // after 00:00 UTC.
  const emails: OutboxEmail[] = [];
  for (const reg of rows) {
    const params = {
      to: reg.email,
      firstName: reg.first_name,
      lastName: reg.last_name,
      divisions: reg.divisions,
      feeCents: reg.fee_cents,
      isComp: reg.fee_cents === 0,
      alreadyPaid: reg.paid,
      confirmUrl: `${BASE_URL}/confirm?id=${reg.id}`,
      musicUploadUrl: reg.music_upload_token ? `${BASE_URL}/upload?token=${reg.music_upload_token}` : undefined,
      registrationId: reg.id,
      teams: teamsByReg[reg.id] ?? [],
    };
    emails.push({ template: 'confirmation', params });
    if (reg.age_on_event < 18 && reg.parent_email && reg.parent_email.toLowerCase() !== reg.email.toLowerCase()) {
      emails.push({ template: 'confirmation', params: { ...params, to: reg.parent_email } });
    }
  }

  const { queued, failed } = await enqueueEmails(emails, { priority: 2 });

  await logAudit('bulk_resend_confirmations', {
    actor: 'admin',
    details: { total_recipients: emails.length, queued, failed: failed.length, failed_emails: failed.map((f) => f.email) },
  });

  return NextResponse.json(
    { ok: true, totalRegistrations: rows.length, totalRecipients: emails.length, queued, failed },
    { headers: { 'x-request-id': requestId } }
  );
});
