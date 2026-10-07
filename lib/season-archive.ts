import type { DivisionStandings, StandingRow } from './standings.ts';

/**
 * Season archive (docs/specs/season-archive.md): the public record of a finished contest as plain static
 * pages and JSON. Pure: it only reformats standings that already passed the public-name rules
 * (lib/standings.ts), so the archive can never show more than the live results page does. The scanner
 * and count check below are what `archive:verify` runs before anything is merged or purged.
 */

export interface ArchiveDivisionInput {
  code: string;
  name: string;
  standings: DivisionStandings;
}

export interface ArchiveMeta {
  season: string;
  contestName: string;
  shortName: string;
  /** e.g. "September 19, 2026 · Dulles Town Center, Sterling, VA" */
  dateAndPlace: string;
  /** Label for the home-state title, e.g. "VA State Champion"; omit to leave champions out */
  championTitle?: string;
  /** Registration ids that hold the home-state title in their division, keyed by division code */
  champions?: Record<string, string[]>;
  /** ISO timestamp the archive was generated */
  generatedAt: string;
}

export interface ArchiveRow {
  place: number;
  name: string;
  city: string | null;
  state: string | null;
  result: string;
  detail?: string;
  champion?: boolean;
}

export interface ArchiveDivision {
  code: string;
  name: string;
  format: string;
  rounds: { name: string; rows: ArchiveRow[] }[];
  final: ArchiveRow[];
}

export interface ArchiveData {
  season: string;
  contest: string;
  shortName: string;
  dateAndPlace: string;
  generatedAt: string;
  divisions: ArchiveDivision[];
}

const toRow = (r: StandingRow, champs: ReadonlySet<string>): ArchiveRow => ({
  place: r.place,
  name: r.display_name,
  city: r.city,
  state: r.state,
  result: r.value_label,
  ...(r.detail ? { detail: r.detail } : {}),
  ...(champs.has(r.registration_id) ? { champion: true } : {}),
});

/** The data half of the archive. Only public fields are copied; ids never leave this function. */
export function buildArchiveData(divisions: readonly ArchiveDivisionInput[], meta: ArchiveMeta): ArchiveData {
  return {
    season: meta.season,
    contest: meta.contestName,
    shortName: meta.shortName,
    dateAndPlace: meta.dateAndPlace,
    generatedAt: meta.generatedAt,
    divisions: divisions
      .filter((d) => d.standings.final.length > 0 || d.standings.rounds.some((r) => r.rows.length > 0))
      .map((d) => {
        const champs = new Set(meta.championTitle ? meta.champions?.[d.code] ?? [] : []);
        return {
          code: d.code,
          name: d.name,
          format: d.standings.format,
          rounds: d.standings.rounds.map((r) => ({ name: r.name, rows: r.rows.map((x) => toRow(x, champs)) })),
          final: d.standings.final.map((x) => toRow(x, champs)),
        };
      }),
  };
}

// ---------------------------------------------------------------- html

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const where = (r: ArchiveRow) => [r.city, r.state].filter(Boolean).join(', ');

function table(rows: ArchiveRow[], championTitle?: string): string {
  if (rows.length === 0) return '<p>No results recorded.</p>';
  const body = rows
    .map((r) => {
      const badge = r.champion && championTitle ? ` <strong class="archive-champion">${esc(championTitle)}</strong>` : '';
      return `        <tr><th scope="row">${r.place}</th><td>${esc(r.name)}${badge}</td><td>${esc(where(r))}</td><td>${esc(r.result)}${r.detail ? ` <span class="archive-detail">${esc(r.detail)}</span>` : ''}</td></tr>`;
    })
    .join('\n');
  return `    <table class="archive-table">
      <thead><tr><th scope="col">Place</th><th scope="col">Name</th><th scope="col">From</th><th scope="col">Result</th></tr></thead>
      <tbody>
${body}
      </tbody>
    </table>`;
}

/** The content of a division page, without any site header or footer. */
export function divisionMain(d: ArchiveDivision, a: Pick<ArchiveData, 'season' | 'shortName'>, championTitle?: string): string {
  const rounds = d.rounds.length > 1 ? d.rounds.map((r) => `    <h3>${esc(r.name)}</h3>\n${table(r.rows, championTitle)}`).join('\n') : '';
  return `  <section class="archive-division">
    <p><a href="archive/${esc(a.season)}/index.html">← All ${esc(a.shortName)} results</a></p>
    <h1>${esc(d.name)}</h1>
    <h2>${d.rounds.length > 1 ? 'Final standings' : 'Standings'}</h2>
${table(d.final, championTitle)}
${rounds}
  </section>`;
}

export function indexMain(data: ArchiveData): string {
  const items = data.divisions
    .map((d) => {
      const winner = d.final.find((r) => r.place === 1);
      return `      <li><a href="archive/${esc(data.season)}/${esc(d.code)}.html">${esc(d.name)}</a>${winner ? ` — ${esc(winner.name)}` : ''}</li>`;
    })
    .join('\n');
  return `  <section class="archive-index">
    <h1>${esc(data.shortName)} Results</h1>
    <p>${esc(data.contest)}. ${esc(data.dateAndPlace)}.</p>
    <p>The final record. Names follow the same rules as the live results page: young competitors who did not opt in to public listing appear by nickname or first name and last initial only.</p>
    <ul>
${items}
    </ul>
  </section>`;
}

/** A complete page when no site template is given. A site template (header, nav, footer) wraps the same main content. */
export function standalonePage(title: string, main: string, stylesheet?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <base href="/"/>
  <title>${esc(title)}</title>
${stylesheet ? `  <link rel="stylesheet" href="${esc(stylesheet)}"/>\n` : ''}
</head>
<body>
<main id="main-content" role="main">
${main}
</main>
</body>
</html>
`;
}

/** Put generated main content inside a site page: everything outside <main> (head, nav, footer) is kept. */
export function wrapInTemplate(template: string, title: string, canonicalUrl: string, main: string): string {
  const open = template.search(/<main[^>]*>/);
  const close = template.lastIndexOf('</main>');
  if (open < 0 || close < 0 || close < open) throw new Error('The site template has no <main> element.');
  const openTagEnd = template.indexOf('>', open) + 1;
  let head = template.slice(0, openTagEnd);
  const tail = template.slice(close);
  head = head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${canonicalUrl}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonicalUrl}$2`)
    // one structured-data block per page; the template's describes a different page
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  return `${head}\n${main}\n${tail}`;
}

/** Every file of the archive, keyed by path relative to the output folder. */
export function renderArchive(
  data: ArchiveData,
  opts: { championTitle?: string; template?: string; /** Public address of the site, e.g. "https://example.org/" (used for canonical links) */ siteBase?: string; stylesheet?: string } = {},
): Record<string, string> {
  const base = (opts.siteBase ?? '').replace(/\/?$/, '/');
  const files: Record<string, string> = {};
  const wrap = (title: string, path: string, main: string) =>
    opts.template ? wrapInTemplate(opts.template, title, `${base}${path}`, main) : standalonePage(title, main, opts.stylesheet);
  files['results.json'] = JSON.stringify(data, null, 2) + '\n';
  files['index.html'] = wrap(`${data.shortName} Results`, `archive/${data.season}/index.html`, indexMain(data));
  for (const d of data.divisions) {
    files[`${d.code}.html`] = wrap(`${d.name} · ${data.shortName} Results`, `archive/${data.season}/${d.code}.html`, divisionMain(d, data, opts.championTitle));
  }
  return files;
}

// ---------------------------------------------------------------- verification

/** Things that must never appear in an archive file. Returns one message per problem, empty when clean. */
export function emailsIn(text: string): string[] {
  return [...new Set((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))];
}

/**
 * `allowedEmails` are public club addresses (for example the ones already in the site's footer); any other
 * address is a problem.
 */
export function scanForPrivateData(
  files: Record<string, string>,
  restrictedLegalNames: readonly string[] = [],
  allowedEmails: readonly string[] = [],
): string[] {
  const allowed = new Set(allowedEmails.map((e) => e.toLowerCase()));
  const problems: string[] = [];
  const checks: [string, RegExp][] = [
    ['a phone number', /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/],
    ['a Stripe id', /\b(?:cs|pi|ch|re|cus|dp|evt|price|prod|acct)_(?:live_|test_)?[A-Za-z0-9]{8,}\b/],
    ['a UUID (database id)', /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i],
    ['a full date of birth', /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/],
  ];
  for (const [path, text] of Object.entries(files)) {
    // The generation timestamp is the one ISO date we write on purpose.
    const body = path === 'results.json' ? text.replace(/"generatedAt":\s*"[^"]*"/, '') : text;
    for (const [label, re] of checks) {
      const m = re.exec(body);
      if (m) problems.push(`${path}: contains ${label} ("${m[0].slice(0, 40)}")`);
    }
    for (const e of emailsIn(body)) if (!allowed.has(e)) problems.push(`${path}: contains an email address ("${e}")`);
    const lower = body.toLowerCase();
    for (const n of restrictedLegalNames) {
      if (n.trim().length > 2 && lower.includes(n.trim().toLowerCase())) problems.push(`${path}: shows the legal name of a competitor who is not public`);
    }
  }
  return problems;
}

/** Row counts per division and round from live standings versus the archive data. Empty when they agree. */
export function compareCounts(divisions: readonly ArchiveDivisionInput[], data: ArchiveData): string[] {
  const problems: string[] = [];
  for (const d of divisions) {
    const live = d.standings;
    const total = live.final.length + live.rounds.reduce((n, r) => n + r.rows.length, 0);
    const got = data.divisions.find((x) => x.code === d.code);
    if (!got) {
      if (total > 0) problems.push(`${d.code}: missing from the archive (${total} rows)`);
      continue;
    }
    if (got.final.length !== live.final.length) problems.push(`${d.code}: final has ${got.final.length} rows, expected ${live.final.length}`);
    live.rounds.forEach((r, i) => {
      const n = got.rounds[i]?.rows.length ?? -1;
      if (n !== r.rows.length) problems.push(`${d.code} / ${r.name}: ${n} rows, expected ${r.rows.length}`);
    });
  }
  return problems;
}
