import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from './supabase/admin';
import { FROM, REPLY_TO, renderEmail, type EmailResult, type OutboxEmail, type RenderedEmail } from './email';
import {
  budgetCap,
  classifyError,
  nextUtcMidnight,
  parseDailyQuota,
  retryDelayMs,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_PRIORITY_RESERVE,
  DRAIN_SEND_SPACING_MS,
  MAX_ATTEMPTS,
  type Priority,
  type ResendError,
  type SendFailure,
} from './email-policy';

// =============================================================================
// Email outbox
// =============================================================================
// Every email is stored in email_outbox before it's sent, so nothing is lost
// to a slow Resend, a throttle, or the daily cap. queueEmail() stores the row
// and sends it right away when today's budget allows; anything that can't go
// now is retried by drainOutbox(), which runs:
//   - after each successful send (a few due rows, via after()),
//   - every 5 minutes from Supabase pg_cron while a row is due (0036),
//   - once a day from Vercel cron just after the 00:00 UTC reset.
// Rules and limits live in lib/email-policy.ts.
// =============================================================================

export interface QueueOptions {
  /** Same key twice is stored and sent once (webhook replays, double submits). */
  dedupeKey?: string;
  /** Defaults to 0 (someone is waiting on it). */
  priority?: Priority;
}

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const DAILY_LIMIT = intEnv('EMAIL_DAILY_LIMIT', DEFAULT_DAILY_LIMIT);
const PRIORITY_RESERVE = intEnv('EMAIL_PRIORITY_RESERVE', DEFAULT_PRIORITY_RESERVE);
const capFor = (priority: Priority) => budgetCap(priority, DAILY_LIMIT, PRIORITY_RESERVE);

type OutboxRow = { id: string; payload: OutboxEmail; priority: Priority; attempts: number };

async function sentToday(): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from('email_daily_usage')
      .select('sent')
      .eq('day', new Date().toISOString().slice(0, 10))
      .maybeSingle();
    return data?.sent ?? 0;
  } catch {
    // Fail open: Resend's own quota error still stops us.
    return 0;
  }
}

/** Record a delivered email; prefer Resend's account-wide count when it sent one. */
async function recordUsage(quotaUsed: number | null): Promise<void> {
  try {
    const supabase = createAdminClient();
    await (quotaUsed === null
      ? supabase.rpc('record_email_send', { p_count: 1 })
      : supabase.rpc('observe_email_usage', { p_used: quotaUsed }));
  } catch (e) {
    console.error('[outbox] usage bookkeeping failed:', e);
  }
}

type SendResult = { kind: 'sent'; quotaUsed: number | null } | SendFailure;

/**
 * One send through Resend's REST API. (The SDK version in this repo doesn't
 * expose response headers, and we need x-resend-daily-quota.)
 */
async function sendViaResend(r: RenderedEmail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { kind: 'retry', error: 'resend_not_configured' };

  // One quick in-place retry for the per-second throttle, which clears in
  // about a second; anything longer goes back to the outbox.
  for (let attempt = 0; ; attempt++) {
    let error: ResendError;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [r.to],
          ...(r.cc?.length ? { cc: r.cc } : {}),
          reply_to: REPLY_TO,
          subject: r.subject,
          html: r.html,
          text: r.text,
          ...(r.attachments?.length ? { attachments: r.attachments } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const quotaUsed = parseDailyQuota(res.headers.get('x-resend-daily-quota'));
      if (res.ok) return { kind: 'sent', quotaUsed };
      const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
      error = { name: body.name, message: body.message, statusCode: res.status };
    } catch (e) {
      error = { name: 'network_error', message: String(e) };
    }

    const failure = classifyError(error);
    if (attempt === 0 && error.name === 'rate_limit_exceeded' && failure.kind === 'retry') {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      continue;
    }
    return failure;
  }
}

/** Apply a send result to its outbox row. Returns how the email ended up. */
async function settleRow(row: Pick<OutboxRow, 'id' | 'attempts'>, result: SendResult): Promise<'sent' | 'queued' | 'dead'> {
  const supabase = createAdminClient();
  const now = new Date();
  if (result.kind === 'sent') {
    await supabase.from('email_outbox').update({ sent_at: now.toISOString() }).eq('id', row.id);
    await recordUsage(result.quotaUsed);
    return 'sent';
  }
  if (result.kind === 'quota') {
    await supabase.from('email_outbox')
      .update({ not_before: result.retryAt.toISOString(), last_error: result.error, claimed_at: null })
      .eq('id', row.id);
    return 'queued';
  }
  const attempts = row.attempts + 1;
  if (result.kind === 'failed' || attempts >= MAX_ATTEMPTS) {
    await supabase.from('email_outbox')
      .update({ attempts, dead_at: now.toISOString(), last_error: result.error })
      .eq('id', row.id);
    console.error('[outbox] gave up on email', row.id, result.error);
    // Ids only: the error text and row can hold registrant addresses.
    Sentry.captureMessage('Email gave up after retries', {
      level: 'error',
      tags: { outbox_id: row.id, result: result.kind },
    });
    return 'dead';
  }
  await supabase.from('email_outbox')
    .update({
      attempts,
      not_before: new Date(now.getTime() + retryDelayMs(attempts - 1)).toISOString(),
      last_error: result.error,
      claimed_at: null,
    })
    .eq('id', row.id);
  return 'queued';
}

/**
 * Store an email and try to send it now. Returns ok for anything the outbox
 * accepted, with queued: true when it will go out later.
 */
export async function queueEmail(email: OutboxEmail, opts: QueueOptions = {}): Promise<EmailResult> {
  const priority = opts.priority ?? 0;
  const rendered = renderEmail(email);
  const supabase = createAdminClient();

  // Insert already claimed by this request, so a concurrent drain leaves it alone.
  const { data, error } = await supabase
    .from('email_outbox')
    .upsert(
      {
        template: email.template,
        to_email: rendered.to,
        payload: email,
        priority,
        dedupe_key: opts.dedupeKey ?? null,
        claimed_at: new Date().toISOString(),
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    )
    .select('id');

  if (error) {
    // The outbox is unavailable; still try to deliver rather than drop it.
    console.error('[outbox] insert failed, sending without a record:', error);
    const result = await sendViaResend(rendered);
    if (result.kind === 'sent') {
      await recordUsage(result.quotaUsed);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }
  if (!data?.length) return { ok: true }; // dedupe_key already stored: queued or sent before

  const row = { id: data[0].id as string, attempts: 0 };
  if ((await sentToday()) >= capFor(priority)) {
    await supabase.from('email_outbox')
      .update({ not_before: nextUtcMidnight().toISOString(), last_error: 'daily budget reached', claimed_at: null })
      .eq('id', row.id);
    return { ok: true, queued: true };
  }

  const outcome = await settleRow(row, await sendViaResend(rendered));
  if (outcome === 'sent') {
    kickDrain();
    return { ok: true };
  }
  if (outcome === 'queued') return { ok: true, queued: true };
  return { ok: false, error: 'email could not be delivered (see email_outbox.last_error)' };
}

/** Store many emails without sending inline (bulk sends); the drain sends them. */
export async function enqueueEmails(
  emails: OutboxEmail[],
  opts: { priority?: Priority } = {},
): Promise<{ queued: number; failed: { email: string; error: string }[] }> {
  if (!emails.length) return { queued: 0, failed: [] };
  const rows = emails.map((email) => ({
    template: email.template,
    to_email: renderEmail(email).to,
    payload: email,
    priority: opts.priority ?? 2,
  }));
  const { error } = await createAdminClient().from('email_outbox').insert(rows);
  if (error) {
    return { queued: 0, failed: rows.map((r) => ({ email: r.to_email, error: error.message })) };
  }
  kickDrain(20);
  return { queued: rows.length, failed: [] };
}

/** Drain a few due rows once the response is out. */
function kickDrain(limit = 5): void {
  try {
    after(async () => {
      try {
        await drainOutbox(limit);
      } catch (e) {
        console.error('[outbox] background drain failed:', e);
      }
    });
  } catch {
    // Outside a request scope: the scheduled drains cover it.
  }
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  requeued: number;
  dead: number;
  /** Set when the database couldn't be asked for due rows. */
  claimFailed?: boolean;
}

/**
 * Send due outbox rows, highest priority first, at 2/second. Stops starting
 * new sends after `timeBudgetMs` and hands unprocessed rows back, so a
 * function timeout never strands claims.
 */
export async function drainOutbox(limit = 60, timeBudgetMs = 40_000): Promise<DrainSummary> {
  const supabase = createAdminClient();
  const summary: DrainSummary = { claimed: 0, sent: 0, requeued: 0, dead: 0 };
  const deadline = Date.now() + timeBudgetMs;

  const { data: rows, error } = await supabase.rpc('claim_email_outbox', { p_limit: limit });
  if (error || !rows) {
    console.error('[outbox] claim failed:', error);
    Sentry.captureException(error ?? new Error('claim_email_outbox returned no rows'));
    return { ...summary, claimFailed: true };
  }
  summary.claimed = rows.length;

  const release = (id: string, fields: Record<string, unknown> = {}) =>
    supabase.from('email_outbox').update({ ...fields, claimed_at: null }).eq('id', id);

  let used = await sentToday();
  let quotaUntil: Date | null = null; // Resend said the cap is hit: stop calling it
  let lastSendAt = 0;

  for (const row of rows as OutboxRow[]) {
    try {
      if (Date.now() >= deadline) {
        await release(row.id);
        continue;
      }
      const blockedUntil = quotaUntil ?? (used >= capFor(row.priority) ? nextUtcMidnight() : null);
      if (blockedUntil) {
        await release(row.id, { not_before: blockedUntil.toISOString() });
        summary.requeued += 1;
        continue;
      }

      const wait = lastSendAt + DRAIN_SEND_SPACING_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSendAt = Date.now();

      const result = await sendViaResend(renderEmail(row.payload));
      if (result.kind === 'sent') used = result.quotaUsed ?? used + 1;
      if (result.kind === 'quota') quotaUntil = result.retryAt;

      const outcome = await settleRow(row, result);
      if (outcome === 'sent') summary.sent += 1;
      else if (outcome === 'queued') summary.requeued += 1;
      else summary.dead += 1;
    } catch (e) {
      console.error('[outbox] drain row failed:', row.id, e);
      Sentry.captureException(e, { tags: { outbox_id: row.id } });
      await release(row.id);
    }
  }

  // Keep 30 days of finished rows for debugging.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  await supabase
    .from('email_outbox')
    .delete()
    .lt('created_at', cutoff)
    .or('sent_at.not.is.null,dead_at.not.is.null');

  return summary;
}
