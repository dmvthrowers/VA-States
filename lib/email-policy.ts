/**
 * Pure rules for the email outbox (no DB or network calls), so they're unit
 * testable. lib/outbox.ts applies them.
 *
 * Resend's free tier allows 100 emails per UTC day, resetting at 00:00 UTC,
 * and 10 requests/second. Both limits are per Resend account, which this app
 * shares with the YoYo Map, and inbound mail counts toward the daily 100.
 * Every send response carries x-resend-daily-quota (the account's usage so
 * far today), so the outbox tracks the higher of that and its own count.
 */

export type Priority = 0 | 1 | 2;

/** Emails we stop at, leaving a buffer for inbound mail and the map's unseen sends. */
export const DEFAULT_DAILY_LIMIT = 90;
/** Of the daily limit, how many only priority 0 (someone is waiting) may use. */
export const DEFAULT_PRIORITY_RESERVE = 30;
/** Retries for throttling, 5xx and network errors. Quota waits don't count. */
export const MAX_ATTEMPTS = 5;
/** Drain pacing: 2 sends/second per app keeps both apps far under Resend's 10/s. */
export const DRAIN_SEND_SPACING_MS = 500;

/** The most emails an email of this priority may push today's total to. */
export function budgetCap(priority: Priority, dailyLimit: number, reserve: number): number {
  return priority === 2 ? Math.max(0, dailyLimit - reserve) : dailyLimit;
}

export type ResendError = { name?: string; message?: string; statusCode?: number | null };

export type SendFailure =
  | { kind: 'quota'; retryAt: Date; error: string } // daily or monthly cap
  | { kind: 'retry'; error: string }                // throttle, 5xx, network
  | { kind: 'failed'; error: string };              // retrying won't help

const TRANSIENT_ERRORS = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
  'concurrent_idempotent_requests',
  'network_error',
]);

/**
 * Resend reports the daily and monthly caps as their own error names. Older
 * responses used rate_limit_exceeded with "daily"/"quota" in the message, so
 * both forms count as a quota wait.
 */
export function classifyError(error: ResendError, now = new Date()): SendFailure {
  const name = error.name ?? 'unknown';
  const detail = `${name}: ${error.message || 'no detail'}`;
  if (name === 'daily_quota_exceeded' || (name === 'rate_limit_exceeded' && /daily|quota/i.test(error.message ?? ''))) {
    return { kind: 'quota', retryAt: nextUtcMidnight(now), error: detail };
  }
  if (name === 'monthly_quota_exceeded') {
    return { kind: 'quota', retryAt: nextUtcMonth(now), error: detail };
  }
  if (TRANSIENT_ERRORS.has(name) || (error.statusCode ?? 0) >= 500) {
    return { kind: 'retry', error: detail };
  }
  return { kind: 'failed', error: detail };
}

export function nextUtcMidnight(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

export function nextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Backoff before retry number `attempts + 1`: 1, 2, 4, 8 … minutes, capped at 1 hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, 60 * 60_000);
}

/** Parse Resend's x-resend-daily-quota header value. */
export function parseDailyQuota(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
