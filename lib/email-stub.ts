/**
 * Email stub (master plan E8): a fresh deployment has no mail provider, so emails are logged, not sent, and
 * stay queued until RESEND_API_KEY is set. Pure helpers; lib/outbox.ts applies them.
 */

/** How long a stubbed email waits before the outbox looks at it again (one log line per email per hour) */
export const STUB_RECHECK_MS = 60 * 60 * 1000;

/** "jane.doe@example.org" → "j***@example.org". Logs must not hold whole addresses. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address[0]}***${address.slice(at)}`;
}

/** The one line written to the server log in place of a send. */
export function stubLine(subject: string, to: string): string {
  return `[email stub] not sent, no mail provider set: "${subject.replace(/\s+/g, ' ').trim().slice(0, 120)}" to ${maskEmail(to)}. Set RESEND_API_KEY to send; it stays queued.`;
}

/** True when a mail provider is configured. */
export function providerConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
}
