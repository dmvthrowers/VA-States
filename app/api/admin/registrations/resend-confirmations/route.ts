import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBearerToken, getStaffIdentityFromToken } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { sendConfirmationEmail } from '@/lib/email';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';

async function requireAdmin(req: NextRequest, requestId: string) {
  const token = getBearerToken(req);
  if (!token) return apiError('unauthorized', 'Missing bearer token', requestId);

  const identity = await getStaffIdentityFromToken(token);
  if (!identity || !identity.isActive || identity.role !== 'admin') {
    return apiError('forbidden', 'Admin access required', requestId);
  }

  return identity;
}

interface ResultRow {
  id: string;
  email: string;
  ok: boolean;
  error?: string;
}

/**
 * POST /api/admin/registrations/resend-confirmations
 *
 * Re-sends the registration confirmation email (magic link, payment status,
 * music upload link) to every competitor registration on file — and to the
 * parent email for any minor. Uses each registration's already-issued
 * music_upload_token, does not generate new tokens or IDs. Already-paid
 * registrants get the payment-required block suppressed so the resend
 * doesn't ask them to pay again.
 *
 * Body: { dryRun?: boolean } — dryRun returns the recipient list/count
 * without sending anything.
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

  const results: ResultRow[] = [];

  for (const reg of rows) {
    const confirmUrl = `${BASE_URL}/confirm?id=${reg.id}`;
    const musicUploadUrl = reg.music_upload_token ? `${BASE_URL}/upload?token=${reg.music_upload_token}` : undefined;
    const isComp = reg.fee_cents === 0;

    const result = await sendConfirmationEmail({
      to: reg.email,
      firstName: reg.first_name,
      lastName: reg.last_name,
      divisions: reg.divisions,
      feeCents: reg.fee_cents,
      isComp,
      alreadyPaid: reg.paid,
      confirmUrl,
      musicUploadUrl,
      registrationId: reg.id,
    });
    results.push({ id: reg.id, email: reg.email, ok: result.ok, error: result.ok ? undefined : result.error });

    if (reg.age_on_event < 18 && reg.parent_email && reg.parent_email.toLowerCase() !== reg.email.toLowerCase()) {
      const parentResult = await sendConfirmationEmail({
        to: reg.parent_email,
        firstName: reg.first_name,
        lastName: reg.last_name,
        divisions: reg.divisions,
        feeCents: reg.fee_cents,
        isComp,
        alreadyPaid: reg.paid,
        confirmUrl,
        musicUploadUrl,
        registrationId: reg.id,
      });
      results.push({
        id: reg.id,
        email: reg.parent_email,
        ok: parentResult.ok,
        error: parentResult.ok ? undefined : parentResult.error,
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  await logAudit('bulk_resend_confirmations', {
    actor: 'admin',
    details: { total_recipients: results.length, sent, failed: failed.length, failed_emails: failed.map((f) => f.email) },
  });

  return NextResponse.json(
    { ok: true, totalRegistrations: rows.length, totalRecipients: results.length, sent, failed },
    { headers: { 'x-request-id': requestId } }
  );
});
