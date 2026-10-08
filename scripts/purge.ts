/**
 * End-of-season purge and reset (docs/specs/season-archive.md, build plan 4.4). A person runs this after the
 * archive is live and a backup exists. It is never called from the web app or a cron job.
 *
 *   npm run purge -- --season 2026 --event-date 2026-09-19             # dry run (default): counts only
 *   npm run purge -- --season 2026 --event-date 2026-09-19 --apply \
 *     --archive-url https://dmvthrowers.club/archive/2026/ --backup-at 2026-10-20T03:00:00Z --restore-tested \
 *     --confirm "PURGE 2026"
 *   npm run purge -- --expire [--apply]       # delete consent records past their keep-until date and
 *                                             # anonymized registrations past the 7-year payment-record window
 *
 * What it does is in the database function vsyc_season_purge() (migration 0060): one transaction, so it is all or
 * nothing. Then it deletes the music files from the storage bucket (the lo-fi pool stays). Running it again after a
 * failure is safe: the database step finds nothing left to do, and the storage step lists what is left.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local). Reads standings the same way the archive does.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { MUSIC_BUCKET } from '@/lib/music-pool';
import { buildArchiveData } from '@/lib/season-archive';
import { championRows, musicObjectsToDelete, purgeProblems } from '@/lib/season-purge';
import { loadArchiveInputs } from './archive-lib';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Every object path in the music bucket, folders walked. */
async function listBucket(): Promise<string[]> {
  const storage = createAdminClient().storage.from(MUSIC_BUCKET);
  const out: string[] = [];
  const walk = async (prefix: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`Could not list ${MUSIC_BUCKET}/${prefix}: ${error.message}`);
      if (!data?.length) return;
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) await walk(path); // a folder
        else out.push(path);
      }
      if (data.length < 1000) return;
    }
  };
  await walk('');
  return out;
}

async function main() {
  const apply = flag('apply');
  const db = createAdminClient();

  if (flag('expire')) {
    const { data, error } = await db.rpc('vsyc_expire_old_records', { p_today: new Date().toISOString().slice(0, 10), p_apply: apply });
    if (error) throw new Error(`vsyc_expire_old_records failed: ${error.message}`);
    console.log(`${apply ? 'Deleted' : 'Would delete'}:`, JSON.stringify(data));
    if (!apply) console.log('Dry run. Add --apply to delete.');
    return;
  }

  const season = arg('season');
  const eventDate = arg('event-date');
  if (!season || !/^\d{4}$/.test(season)) throw new Error('Pass --season <year>, for example --season 2026');
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error('Pass --event-date YYYY-MM-DD (contest day; it sets how long consent records are kept)');

  // Past champions come from the same public data the archive uses.
  const { divisions, meta } = await loadArchiveInputs(season);
  const champions = championRows(buildArchiveData(divisions, meta));

  const leftover = musicObjectsToDelete(await listBucket());

  if (apply) {
    const url = arg('archive-url');
    let archiveStatus: number | null = null;
    let archiveBody = '';
    if (url) {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        archiveStatus = res.status;
        archiveBody = await res.text();
      } catch { /* unreachable: reported below */ }
    }
    const problems = purgeProblems({
      season, confirm: arg('confirm') ?? null, archiveStatus, archiveBody,
      backupAt: arg('backup-at') ?? null, restoreTested: flag('restore-tested'), now: new Date(),
    });
    if (!url) problems.unshift('Pass --archive-url, the live address of the archive on the club site.');
    if (problems.length) {
      console.error('Not purging:\n- ' + problems.join('\n- '));
      process.exit(1);
    }
  }

  const { data, error } = await db.rpc('vsyc_season_purge', {
    p_season: Number(season), p_event_date: eventDate, p_champions: champions, p_apply: apply, p_confirm: apply ? `PURGE ${season}` : null,
  });
  if (error) throw new Error(`vsyc_season_purge failed: ${error.message}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`Past champions to record: ${champions.length}. Music files in ${MUSIC_BUCKET} to delete: ${leftover.length} (lofi/ is kept).`);

  if (!apply) {
    console.log('Dry run: nothing was changed. Add --apply (with the flags in this file\'s header) to purge.');
    return;
  }
  for (let i = 0; i < leftover.length; i += 100) {
    const { error: rmError } = await db.storage.from(MUSIC_BUCKET).remove(leftover.slice(i, i + 100));
    if (rmError) throw new Error(`Database purged, but deleting music files failed: ${rmError.message}. Run this again to finish.`);
  }
  console.log(`Purged season ${season}. Next: reset contest.config.ts for the new season (docs/specs/season-archive.md, "Reset").`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
