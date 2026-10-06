import { createAdminClient } from '@/lib/supabase/admin';
import { competition, contest, longDate } from '@/contest.config';
import { fetchHomeStateEligible, fetchStandings, stateChampions } from '@/lib/standings';
import { isNameRestricted, legalName } from '@/lib/display-name';
import type { ArchiveDivisionInput, ArchiveMeta } from '@/lib/season-archive';

/**
 * Loads what the archive needs through the same functions the public results page uses
 * (lib/standings.ts), plus the legal names that must NOT appear (minors who are not public), for the verifier.
 * Read-only: nothing here writes to the database.
 */
export async function loadArchiveInputs(season: string): Promise<{ divisions: ArchiveDivisionInput[]; meta: ArchiveMeta; restrictedLegalNames: string[] }> {
  const db = createAdminClient();
  const [standings, eligible] = await Promise.all([fetchStandings(db), fetchHomeStateEligible(db, contest.stateChampion.state)]);

  const divisions: ArchiveDivisionInput[] = competition.divisions.map((d) => ({
    code: d.code,
    name: d.name,
    standings: standings[d.code],
  }));

  const champions: Record<string, string[]> = {};
  for (const d of divisions) {
    champions[d.code] = stateChampions(d.standings.final, contest.stateChampion.state, eligible ?? undefined).map((r) => r.registration_id);
  }

  const { data, error } = await db.from('vsyc_registrations').select('first_name, last_name, is_minor, is_public');
  if (error) throw new Error(`Could not read registrations for the privacy check: ${error.message}`);
  const restrictedLegalNames = (data ?? [])
    .filter((r) => isNameRestricted(r))
    .map((r) => legalName(r))
    .filter((n) => n.trim().length > 0);

  const meta: ArchiveMeta = {
    season,
    contestName: contest.name,
    shortName: contest.shortName,
    dateAndPlace: `${longDate()} · ${contest.venue.name}, ${contest.venue.city}`,
    championTitle: contest.stateChampion.state ? contest.stateChampion.title : undefined,
    champions,
    generatedAt: new Date().toISOString(),
  };
  return { divisions, meta, restrictedLegalNames };
}
