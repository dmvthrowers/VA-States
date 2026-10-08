/**
 * Regenerate supabase/divisions.sql from contest.config.ts → competition.
 *
 *   npm run divisions           # write the file
 *   npm run divisions -- --check   # fail if the file is out of date (CI)
 *
 * Then apply it: Supabase → SQL Editor → paste → Run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { competition, dayOf, DIVISION_CODES } from '../contest.config.ts';
import { divisionsSql } from '../lib/divisions-core.ts';
import { scheduleIssues } from '../lib/schedule-core.ts';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'divisions.sql');
const sched = scheduleIssues(dayOf.schedule, DIVISION_CODES, dayOf.sideEvents);
if (sched.length) {
  console.error(`contest.config.ts dayOf block:\n- ${sched.join('\n- ')}`);
  process.exit(1);
}
const sql = divisionsSql(competition);

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(file, 'utf8'); } catch { /* missing */ }
  if (current !== sql) {
    console.error('supabase/divisions.sql is out of date. Run `npm run divisions` and commit the result.');
    process.exit(1);
  }
  console.log('supabase/divisions.sql matches contest.config.ts');
} else {
  writeFileSync(file, sql);
  console.log(`wrote supabase/divisions.sql (${competition.divisions.length} divisions)`);
}
