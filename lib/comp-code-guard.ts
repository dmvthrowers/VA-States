import { kv } from '@vercel/kv';

const MAX_FAILS_PER_CODE = 10;
const LOCKOUT_MINUTES = 30;

/**
 * Per-code lockout, independent of the per-IP rate limit in lib/rate-limit.ts.
 * An attacker rotating IPs can dodge an IP-based limiter but not this — it
 * counts failures against the specific code string being guessed. Fails open
 * on a KV outage, same tradeoff as the IP limiter (never blocks legitimate
 * registrations because of an infra hiccup).
 */
export async function isCodeLocked(code: string): Promise<boolean> {
  try {
    const fails = await kv.get<number>(`compcode:fails:${code}`);
    return (fails ?? 0) >= MAX_FAILS_PER_CODE;
  } catch (e) {
    console.error('[comp-code-guard] lock check failed:', e);
    return false;
  }
}

export async function recordFailedCodeAttempt(code: string): Promise<void> {
  try {
    const key = `compcode:fails:${code}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, LOCKOUT_MINUTES * 60);
    }
  } catch (e) {
    console.error('[comp-code-guard] record failed:', e);
  }
}
