import type { ArchiveData } from './season-archive.ts';

/**
 * Season purge (docs/specs/season-archive.md, build plan 4.4): the checks and shaping that `npm run purge` does
 * around the database function vsyc_season_purge(). Pure, so the safety rules are tested without a database.
 */

export interface PastChampion {
  division: string;
  place: number;
  display_name: string;
  state: string | null;
  is_state_champion: boolean;
}

/**
 * Who goes into vsyc_past_champions: everyone on the podium (places 1 to `podium`, ties included) and anyone
 * marked as the home-state champion, from the archive's final standings. Public names only: the archive has
 * already applied the public-name rule, so a minor who isn't opted in is a handle or first name + last initial.
 */
export function championRows(data: Pick<ArchiveData, 'divisions'>, podium = 3): PastChampion[] {
  const out: PastChampion[] = [];
  for (const d of data.divisions) {
    for (const r of d.final) {
      if (r.place <= podium || r.champion) {
        out.push({ division: d.code, place: r.place, display_name: r.name, state: r.state, is_state_champion: !!r.champion });
      }
    }
  }
  return out;
}

export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PurgeGuardInput {
  season: string;
  /** What the operator typed to confirm; must be exactly `PURGE <season>` */
  confirm: string | null;
  /** HTTP status of the live archive page, or null if it could not be fetched */
  archiveStatus: number | null;
  archiveBody: string;
  /** When the latest backup dump finished (ISO), as the operator reports it */
  backupAt: string | null;
  /** The operator says a restore of a dump was tested this season */
  restoreTested: boolean;
  now: Date;
}

/**
 * Reasons `--apply` must refuse. Empty means it may go ahead. The archive must be live (the freeze PR merged),
 * a backup from the last 24 hours must exist and a restore must have been tested, and the operator must type the
 * season to confirm. A dry run needs none of this.
 */
export function purgeProblems(i: PurgeGuardInput): string[] {
  const out: string[] = [];
  if (!/^\d{4}$/.test(i.season)) out.push('Pass --season <year>, for example --season 2026.');
  if (i.confirm !== `PURGE ${i.season}`) out.push(`Type the season to confirm: --confirm "PURGE ${i.season}".`);
  if (i.archiveStatus !== 200) out.push(`The archive page is not live (status ${i.archiveStatus ?? 'unreachable'}). Merge the freeze PR on the club site first.`);
  else if (!i.archiveBody.includes(i.season)) out.push(`The archive page is live but does not mention ${i.season}. Check --archive-url.`);
  if (!i.backupAt) out.push('Say when the last backup finished: --backup-at <ISO time of the db-backup run>.');
  else {
    const t = Date.parse(i.backupAt);
    if (Number.isNaN(t)) out.push('--backup-at is not a date.');
    else if (t > i.now.getTime() + 60_000) out.push('--backup-at is in the future.');
    else if (i.now.getTime() - t > BACKUP_MAX_AGE_MS) out.push('The last backup is more than 24 hours old. Run db-backup.yml again.');
  }
  if (!i.restoreTested) out.push('A restore must have been tested this season. Pass --restore-tested once it has.');
  return out;
}

/** Music bucket objects the purge deletes: everything except the lo-fi pool under `lofi/`. */
export function musicObjectsToDelete(paths: readonly string[]): string[] {
  return paths.filter((p) => !p.startsWith('lofi/'));
}
