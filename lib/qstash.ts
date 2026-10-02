import { Receiver } from '@upstash/qstash';

/**
 * True when the request carries a valid QStash signature. A QStash schedule
 * calls the email drain as a backstop to Supabase pg_cron; drains claim rows
 * atomically, so overlapping runs never send an email twice.
 *
 * False until QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY are set.
 * devMode is off so a stray QSTASH_DEV can't make the public local-dev keys
 * valid in production.
 */
export async function isSignedByQstash(req: Request): Promise<boolean> {
  const signature = req.headers.get('upstash-signature');
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) return false;

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey, devMode: false });
    return await receiver.verify({ signature, body: await req.clone().text(), clockTolerance: 5 });
  } catch {
    return false;
  }
}
