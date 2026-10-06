// Season archive: public fields only, wrapped in the site template, and the private-data scan. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArchiveData, compareCounts, renderArchive, scanForPrivateData, wrapInTemplate } from './season-archive.ts';

const row = (place, id, name, extra = {}) => ({ place, registration_id: id, display_name: name, city: 'Sterling', state: 'VA', value: 90, value_label: '90.00', ...extra });
const standings = (rows) => ({ format: 'freestyle', better: 'higher', rounds: [{ name: 'Prelims', rows }, { name: 'Finals', rows: rows.slice(0, 1) }], final: rows });
const meta = { season: '2026', contestName: 'Virginia State Yo-Yo Contest', shortName: 'VSYC-26', dateAndPlace: 'September 19, 2026', generatedAt: '2026-10-20T12:00:00.000Z', championTitle: 'VA State Champion', champions: { '1A': ['11111111-1111-4111-8111-111111111111'] } };
const divisions = [
  { code: '1A', name: '1A Division', standings: standings([row(1, '11111111-1111-4111-8111-111111111111', 'Ada L.'), row(2, '22222222-2222-4222-8222-222222222222', 'Bo K.', { detail: '3 judges' })]) },
  { code: 'EMPTY', name: 'Nobody', standings: { format: 'showcase', better: 'higher', rounds: [], final: [] } },
];

test('only public fields are copied and ids never reach the data', () => {
  const data = buildArchiveData(divisions, meta);
  assert.equal(data.divisions.length, 1, 'a division with no results is left out');
  const json = JSON.stringify(data);
  assert.ok(!json.includes('registration_id'));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(json), 'no database ids');
  assert.equal(data.divisions[0].final[0].champion, true);
  assert.equal(data.divisions[0].final[1].champion, undefined);
  assert.equal(data.divisions[0].final[1].detail, '3 judges');
});

test('rendered pages are escaped, linked from the index, and pass the private-data scan', () => {
  const evil = [{ ...divisions[0], standings: standings([row(1, '33333333-3333-4333-8333-333333333333', '<b>Mal</b> & "Co"')]) }];
  const data = buildArchiveData(evil, meta);
  const files = renderArchive(data, { championTitle: meta.championTitle });
  assert.deepEqual(Object.keys(files).sort(), ['1A.html', 'index.html', 'results.json']);
  assert.ok(files['1A.html'].includes('&lt;b&gt;Mal&lt;/b&gt; &amp; &quot;Co&quot;'));
  assert.ok(files['index.html'].includes('archive/2026/1A.html'));
  assert.deepEqual(scanForPrivateData(files), []);
});

test('the scan catches emails, phones, Stripe ids, database ids, birth dates and a restricted legal name', () => {
  const bad = {
    'a.html': 'contact ada@example.com or (703) 555-0142',
    'b.html': 'cs_live_a1B2c3D4e5F6 and 11111111-1111-4111-8111-111111111111',
    'c.html': 'born 2012-04-05; Jordan Smith won',
  };
  const out = scanForPrivateData(bad, ['Jordan Smith']).join('\n');
  for (const needle of ['email', 'phone', 'Stripe', 'UUID', 'date of birth', 'legal name']) assert.match(out, new RegExp(needle, 'i'));
  assert.deepEqual(scanForPrivateData({ 'results.json': '{"generatedAt": "2026-10-20T12:00:00.000Z"}' }), [], 'the generation timestamp is allowed');
});

test('club addresses already public on the site are allowed, others are not', () => {
  const files = { 'a.html': 'write to contact@dmvthrowers.club', 'b.html': 'ada@example.com' };
  const out = scanForPrivateData(files, [], ['Contact@DMVThrowers.club']);
  assert.equal(out.length, 1);
  assert.match(out[0], /b\.html.*ada@example\.com/);
});

test('counts are compared per division and round', () => {
  const data = buildArchiveData(divisions, meta);
  assert.deepEqual(compareCounts(divisions, data), []);
  data.divisions[0].final.pop();
  assert.match(compareCounts(divisions, data)[0], /final has 1 rows, expected 2/);
  assert.match(compareCounts([{ ...divisions[0], code: 'ZZ' }], data)[0], /missing from the archive/);
});

test('a site template keeps its header and footer and swaps title, canonical and structured data', () => {
  const tpl = '<html><head><title>Old</title><meta property="og:url" content="https://x/old.html"/><link rel="canonical" href="https://x/old.html"/><script type="application/ld+json">{"a":1}</script></head><body><nav>NAV</nav><main id="main-content" role="main">OLD CONTENT</main><footer>FOOT</footer></body></html>';
  const out = wrapInTemplate(tpl, 'New & Co', 'archive/2026/1A.html', '<p>NEW</p>');
  assert.ok(out.includes('<nav>NAV</nav>') && out.includes('<footer>FOOT</footer>') && out.includes('<p>NEW</p>'));
  assert.ok(!out.includes('OLD CONTENT') && !out.includes('ld+json'));
  assert.ok(out.includes('<title>New &amp; Co</title>') && out.includes('href="https://dmvthrowers.club/archive/2026/1A.html"'));
  assert.throws(() => wrapInTemplate('<html></html>', 't', 'p', 'm'), /no <main>/);
});
