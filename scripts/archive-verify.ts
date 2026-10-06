/**
 * Check an archive folder against the database and for private data (spec step 2). Read-only.
 *
 *   npm run archive:verify -- --season 2026 [--dir archive/2026] [--site ../dmvthrowers.github.io]
 *
 * Fails (exit 1) if row counts differ from the live results, or any file holds an email, phone number,
 * Stripe or database id, birth date, or the legal name of a competitor who is not public.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadArchiveInputs } from './archive-lib';
import { contest } from '@/contest.config';
import { compareCounts, emailsIn, scanForPrivateData, type ArchiveData } from '@/lib/season-archive';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const season = arg('season');
  if (!season || !/^\d{4}$/.test(season)) throw new Error('Pass --season <year>, e.g. --season 2026');
  const dir = arg('dir') ?? join('archive', season);
  const files: Record<string, string> = {};
  for (const f of readdirSync(dir)) if (/\.(html|json)$/.test(f)) files[f] = readFileSync(join(dir, f), 'utf8');
  if (!files['results.json']) throw new Error(`No results.json in ${dir}`);

  const site = arg('site');
  const template = site ? readFileSync(join(site, 'vsyc26-results.html'), 'utf8') : '';
  const { divisions, restrictedLegalNames } = await loadArchiveInputs(season);
  const data = JSON.parse(files['results.json']) as ArchiveData;
  const problems = [...compareCounts(divisions, data), ...scanForPrivateData(files, restrictedLegalNames, [contest.contactEmail, ...emailsIn(template)])];

  console.log(`Checked ${Object.keys(files).length} files against ${divisions.length} divisions and ${restrictedLegalNames.length} protected names.`);
  if (problems.length) {
    console.error('FAILED:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('OK: counts match the database and no private data was found.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
