import { getDb } from './db';

/**
 * Fixed-window IP rate limit backed by D1 (no external KV service needed).
 * Returns true if the request is allowed, false if rate-limited.
 * Fails open — a DB hiccup never blocks legitimate registrations.
 */
export async function checkRateLimit(
  ip: string,
  action: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  try {
    const windowStart = Math.floor(Date.now() / (windowMinutes * 60_000));
    const row = await getDb()
      .prepare(
        `INSERT INTO vsyc_rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
           window_start = ?2
         RETURNING count`
      )
      .bind(`${action}:${ip}`, windowStart)
      .first<{ count: number }>();
    return (row?.count ?? 0) <= max;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return true;
  }
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
