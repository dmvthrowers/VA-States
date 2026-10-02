/**
 * Healthchecks.io check-ins for scheduled jobs. Each successful run pings
 * https://hc-ping.com/<key>/<slug>, a failed run pings .../fail, and
 * Healthchecks.io emails when a ping is late or reports failure. `create=1`
 * makes each check on its first ping, so only the project ping key is needed.
 *
 * Off until HEALTHCHECKS_PING_KEY is set. Never throws: a monitoring outage
 * must not fail the job it watches.
 */
export async function heartbeat(slug: string, outcome: 'ok' | 'fail' = 'ok'): Promise<void> {
  const key = process.env.HEALTHCHECKS_PING_KEY;
  if (!key) return;
  const url = `https://hc-ping.com/${encodeURIComponent(key)}/${slug}${outcome === 'fail' ? '/fail' : ''}?create=1`;
  try {
    await fetch(url, { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch (e) {
    console.error(`[heartbeat] ${slug} ping failed:`, e);
  }
}
