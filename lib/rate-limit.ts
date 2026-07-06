import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

const limiterCache = new Map<string, Ratelimit>();
const hasKvConfig = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let loggedKvFailure = false;

function getLimiter(action: string, max: number, windowMinutes: number): Ratelimit {
  const key = `${action}:${max}:${windowMinutes}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(max, `${windowMinutes} m`),
    prefix: `rl:vsyc26:${action}`,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

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
  if (!hasKvConfig) return true;

  try {
    const limiter = getLimiter(action, max, windowMinutes);
    const { success } = await limiter.limit(ip);
    loggedKvFailure = false;
    return success;
  } catch (error) {
    if (!loggedKvFailure) {
      console.error('Rate limit check failed; temporarily failing open:', error);
      loggedKvFailure = true;
    }
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
