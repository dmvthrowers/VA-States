/**
 * Freeze a season's public record as static pages (docs/specs/season-archive.md, step 1).
 * Read-only: it reads results, writes files, and never touches the database or the club site repo.
 *
 *   npm run archive -- --season 2026 [--out archive/2026] [--site ../dmvthrowers.github.io]
 *
 * With --site, pages reuse that repo's vsyc26-results.html for the header, nav and footer, so the site's
 * boilerplate stays identical; without it you get plain standalone pages. Review the output, then
 * copy it into the site repo as a pull request. Run `npm run archive:verify` before merging.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadArchiveInputs } from './archive-lib';
import { contest } from '@/contest.config';
import { buildArchiveData, compareCounts, emailsIn, renderArchive, scanForPrivateData } from '@/lib/season-archive';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const season = arg('season');
  if (!season || !/^\d{4}$/.test(season)) throw new Error('Pass --season <year>, e.g. --season 2026');
  const out = arg('out') ?? join('archive', season);
  const site = arg('site');
  const template = site ? readFileSync(join(site, 'vsyc26-results.html'), 'utf8') : undefined;

  const { divisions, meta, restrictedLegalNames } = await loadArchiveInputs(season);
  const data = buildArchiveData(divisions, meta);
  const files = renderArchive(data, { championTitle: meta.championTitle, template });

  // Refuse to write anything that fails its own checks.
  const problems = [...compareCounts(divisions, data), ...scanForPrivateData(files, restrictedLegalNames, [contest.contactEmail, ...(template ? emailsIn(template) : [])])];
  if (problems.length) {
    console.error('Not written. Problems found:\n- ' + problems.join('\n- '));
    process.exit(1);
  }

  for (const [path, text] of Object.entries(files)) {
    const full = join(out, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  console.log(`Wrote ${Object.keys(files).length} files to ${out}`);
  for (const d of data.divisions) console.log(`  ${d.code.padEnd(10)} ${d.final.length} placed, ${d.rounds.length} round(s)`);
  const skipped = divisions.length - data.divisions.length;
  if (skipped) console.log(`  (${skipped} division(s) with no results left out)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
