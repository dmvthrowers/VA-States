import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

/**
 * Edge-compatible IP-based rate limit using Upstash/Vercel KV.
 * Returns true if the request is allowed, false if rate-limited.
 * Fails open — a KV outage never blocks legitimate registrations.
 */
export async function checkRateLimit(
  ip: string,
  action: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  try {
    const limiter = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(max, `${windowMinutes} m`),
      prefix: `rl:vsyc26:${action}`,
    });
    const { success } = await limiter.limit(ip);
    return success;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return true;
  }
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
