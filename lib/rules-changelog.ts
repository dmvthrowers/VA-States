/**
 * Rules with a changelog (master plan O5). Pure checks and formatting for contest.rulesPage so a typo
 * in the config is caught by a test, not by a competitor on the day.
 */

export interface RuleChange { version: string; date: string; summary: string[] }
export interface RulesPage { enabled: boolean; version: string; publishedOn: string; changes: RuleChange[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with the rules page config; an empty list means it is sound. */
export function rulesPageIssues(r: RulesPage): string[] {
  const out: string[] = [];
  if (!r.version.trim()) out.push('rulesPage.version is empty');
  if (!DATE.test(r.publishedOn)) out.push('rulesPage.publishedOn must be YYYY-MM-DD');
  const seen = new Set<string>();
  for (const c of r.changes) {
    if (!DATE.test(c.date)) out.push(`Change ${c.version}: date must be YYYY-MM-DD`);
    if (seen.has(c.version)) out.push(`Change ${c.version} appears twice`);
    seen.add(c.version);
    if (c.summary.length === 0 || c.summary.some((s) => !s.trim())) out.push(`Change ${c.version}: say what changed`);
  }
  for (let i = 1; i < r.changes.length; i++) {
    if (r.changes[i].date > r.changes[i - 1].date) out.push('Changes must be newest first');
  }
  if (r.changes.length > 0 && r.changes[0].version !== r.version) {
    out.push(`rulesPage.version is ${r.version} but the newest change is ${r.changes[0].version}`);
  }
  return out;
}

/** "2027-01-15" → "January 15, 2027" (UTC, so the date never shifts with the reader's time zone) */
export function longDateOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
