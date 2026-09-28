import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, apiError } from '@/lib/api-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminRequest } from '@/lib/auth/admin-request';
import { logAudit } from '@/lib/audit';
import { sendSurveyInviteBatch, type SurveyInviteRecipient } from '@/lib/email';
import { fetchStandings, winnersFrom, type Winner } from '@/lib/standings';

// Resend batch sends ~100 emails per request; give a few hundred room to finish.
export const maxDuration = 60;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://register.dmvthrowers.club';
const AUDIT_ACTION = 'survey_invites_sent';
const REMINDER_ACTION = 'survey_reminders_sent';
/** Where "Send test" goes. Override with SURVEY_TEST_EMAIL. */
const TEST_EMAIL = process.env.SURVEY_TEST_EMAIL || 'dmvthrowers@gmail.com';

const AUDIENCES: Record<string, {
  label: string;
  emailLabel: string;
  survey: string;
  extraLine?: string;
  /** The first invite went out by hand, outside this tool: counts as sent. */
  invitedManuallyAt?: string;
}> = {
  winner: {
    label: 'podium finishers',
    emailLabel: 'competitors',
    survey: 'winner',
    extraLine: 'You made the podium, so we also want to hear what you thought of your prizes, including the Goodles shirt and Mac, the MINISO basket, and the sponsor gear.',
  },
  competitor: { label: 'competitors', emailLabel: 'competitors', survey: 'competitor' },
  spectator: { label: 'spectators', emailLabel: 'spectators', survey: 'spectator' },
  volunteer: { label: 'volunteers', emailLabel: 'volunteers', survey: 'volunteer' },
  // Sponsors and vendors come from vsyc26_survey_contacts. Their personal
  // invites went out from the contest Gmail on Sept 24, 2026.
  sponsor: { label: 'sponsors', emailLabel: 'sponsors', survey: 'sponsor', invitedManuallyAt: '2026-09-24T00:13:00Z' },
  vendor: { label: 'vendors', emailLabel: 'vendors', survey: 'vendor', invitedManuallyAt: '2026-09-24T00:12:00Z' },
};
type Audience = 'winner' | 'competitor' | 'spectator' | 'volunteer' | 'sponsor' | 'vendor';

function isAudience(v: unknown): v is Audience {
  return typeof v === 'string' && Object.hasOwn(AUDIENCES, v);
}

async function loadWinners(): Promise<Winner[]> {
  return winnersFrom(await fetchStandings(createAdminClient()));
}

async function loadRecipients(audience: Audience, winners: Winner[]): Promise<SurveyInviteRecipient[]> {
  const supabase = createAdminClient();
  const list: SurveyInviteRecipient[] = [];

  if (audience === 'competitor' || audience === 'winner') {
    // Winners get the winner survey (competitor questions + prizes) instead
    // of the general competitor survey — never both.
    const winnerIds = new Set(winners.map((w) => w.registration_id));
    const { data, error } = await supabase
      .from('vsyc_registrations')
      .select('id, first_name, email, parent_email, age_on_event');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if ((audience === 'winner') !== winnerIds.has(r.id)) continue;
      list.push({ to: r.email, firstName: r.first_name });
      // Minors: the parent usually has the inbox and the spend answers.
      if (r.age_on_event < 18 && r.parent_email) list.push({ to: r.parent_email, firstName: r.first_name });
    }
  } else if (audience === 'sponsor' || audience === 'vendor') {
    const { data, error } = await supabase
      .from('vsyc26_survey_contacts')
      .select('first_name, email, cc')
      .eq('audience', audience);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) list.push({ to: r.email, firstName: r.first_name, cc: r.cc ?? [] });
  } else if (audience === 'spectator') {
    const { data, error } = await supabase.from('vsyc_spectators').select('first_name, email');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) list.push({ to: r.email, firstName: r.first_name });
  } else {
    const { data, error } = await supabase
      .from('vsyc_volunteers')
      .select('first_name, email')
      .eq('status', 'confirmed');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) list.push({ to: r.email, firstName: r.first_name });
  }

  // One email per address, even if someone registered twice.
  const seen = new Set<string>();
  return list.filter((r) => {
    const key = r.to.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function lastSentAt(audience: Audience, action = AUDIT_ACTION): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('vsyc_audit_log')
    .select('created_at')
    .eq('action', action)
    .eq('details->>audience', audience)
    .order('created_at', { ascending: false })
    .limit(1);
  const logged = data?.[0]?.created_at ?? null;
  if (action === AUDIT_ACTION) return logged ?? AUDIENCES[audience].invitedManuallyAt ?? null;
  return logged;
}

/**
 * Emails of people who already answered any survey. Only respondents who left a
 * contact email show up here — the rest are anonymous, which is why the
 * reminder copy tells anyone who already answered to ignore it.
 */
async function respondedEmails(): Promise<Set<string>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc26_survey_responses')
    .select('contact_email')
    .not('contact_email', 'is', null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => String(r.contact_email).trim().toLowerCase()).filter(Boolean));
}

/** A sponsor or vendor counts as answered if they or anyone copied on their email did. */
function hasResponded(r: SurveyInviteRecipient, responded: Set<string>): boolean {
  return [r.to, ...(r.cc ?? [])].some((e) => responded.has(e.trim().toLowerCase()));
}

/**
 * GET /api/admin/surveys/invites — recipient counts and last-sent time per
 * audience, plus the podium list the winner audience is built from, for the
 * Surveys tab. No emails are sent.
 */
export const GET = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const winners = await loadWinners();
  const responded = await respondedEmails();
  const audiences = await Promise.all(
    (Object.keys(AUDIENCES) as Audience[]).map(async (a) => {
      const recipients = await loadRecipients(a, winners);
      return {
        audience: a,
        recipients: recipients.length,
        // Recipients a reminder would skip because they answered with this email.
        responded: recipients.filter((r) => hasResponded(r, responded)).length,
        lastSentAt: await lastSentAt(a),
        lastReminderAt: await lastSentAt(a, REMINDER_ACTION),
        surveyUrl: `${BASE_URL}/survey/${AUDIENCES[a].survey}?src=email`,
      };
    }),
  );

  return NextResponse.json({ audiences, winners }, { headers: { 'x-request-id': requestId } });
});

/**
 * POST /api/admin/surveys/invites
 *
 * Emails the survey link to one audience. Body: { audience, force?, test?, reminder? }.
 * test: true sends only that audience's email to TEST_EMAIL, marked [TEST].
 * reminder: true sends the "still time" follow-up instead, skipping anyone who
 * already answered with their email; it needs the invite to have gone out first.
 * Refuses (409) if that audience already got this email, unless force is true,
 * so a double-click never emails everyone twice.
 */
export const POST = withErrorHandling(async (requestId, req: NextRequest) => {
  const auth = await requireAdminRequest(req, requestId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const audience = body?.audience;
  if (!isAudience(audience)) {
    return apiError('bad_request', 'audience must be winner, competitor, spectator, volunteer, sponsor, or vendor', requestId);
  }
  const reminder = body?.reminder === true;

  // Test send: the exact email this audience would get, to the organizer only.
  // Logged separately so it never counts as the real send (or blocks it).
  if (body?.test === true) {
    const result = await sendSurveyInviteBatch({
      audienceLabel: AUDIENCES[audience].emailLabel,
      surveyUrl: `${BASE_URL}/survey/${AUDIENCES[audience].survey}?src=email`,
      extraLine: AUDIENCES[audience].extraLine,
      recipients: [{ to: TEST_EMAIL, firstName: 'Test' }],
      isTest: true,
      reminder,
    });
    await logAudit('survey_invite_test_sent', {
      actor: auth.email ?? 'admin',
      details: { audience, to: TEST_EMAIL, ok: result.sent === 1, reminder },
    });
    if (result.sent !== 1) {
      return apiError('upstream_error', `Test email failed: ${result.failed[0]?.error ?? 'unknown error'}`, requestId);
    }
    return NextResponse.json({ ok: true, test: true, audience, to: TEST_EMAIL, reminder }, { headers: { 'x-request-id': requestId } });
  }

  const action = reminder ? REMINDER_ACTION : AUDIT_ACTION;
  if (reminder && !(await lastSentAt(audience))) {
    return apiError('conflict', `Send the invite to ${AUDIENCES[audience].label} before a reminder.`, requestId);
  }
  const previous = await lastSentAt(audience, action);
  if (previous && body?.force !== true) {
    return apiError(
      'conflict',
      `Survey ${reminder ? 'reminders' : 'invites'} already went to ${AUDIENCES[audience].label} on ${previous}.`,
      requestId,
    );
  }

  let recipients = await loadRecipients(audience, await loadWinners());
  let skipped = 0;
  if (reminder) {
    const responded = await respondedEmails();
    const before = recipients.length;
    recipients = recipients.filter((r) => !hasResponded(r, responded));
    skipped = before - recipients.length;
  }
  const surveyUrl = `${BASE_URL}/survey/${AUDIENCES[audience].survey}?src=email`;
  const result = await sendSurveyInviteBatch({
    audienceLabel: AUDIENCES[audience].emailLabel,
    surveyUrl,
    extraLine: AUDIENCES[audience].extraLine,
    recipients,
    reminder,
  });

  await logAudit(action, {
    actor: auth.email ?? 'admin',
    details: {
      audience,
      total_recipients: recipients.length,
      sent: result.sent,
      failed: result.failed.length,
      failed_emails: result.failed.map((f) => f.email),
      resend: Boolean(previous),
      ...(reminder ? { skipped_responded: skipped } : {}),
    },
  });

  return NextResponse.json(
    { ok: true, audience, reminder, total: recipients.length, skipped, sent: result.sent, failed: result.failed },
    { headers: { 'x-request-id': requestId } },
  );
});
