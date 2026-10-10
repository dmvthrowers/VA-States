// Unit tests for config-driven divisions: fees, selection rules, scoring, the SQL sync.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { competition } from '../contest.config.ts';
import { PRESETS } from '../presets/competitions.ts';
import {
  computeFee, selectionIssues, cleanStyles, effectiveStyle, styleMultiplier,
  freestyleBreakdown, manualBreakdown, configIssues, divisionsSql,
} from './divisions-core.ts';

const later = new Date('2030-01-01');
const before = new Date('2000-01-01');
const fee = (divs, opts = {}) =>
  computeFee(divs, competition, opts.comp ?? 0, opts.date ?? later, opts.source ?? 'online', opts.cutoff ?? before);

test('fees: sums prices, applies combos once, early bird, walk-up, comps', () => {
  assert.equal(fee(['1A']).fee_cents, 3000);
  assert.deepEqual([fee(['1A', 'X']).fee_cents, fee(['1A', 'X']).combo_applied], [5000, true]);
  assert.equal(fee(['X']).combo_applied, false);
  assert.equal(fee(['1A'], { cutoff: new Date('2031-01-01') }).fee_cents, 2500);
  assert.equal(fee(['SBJ'], { source: 'walk_up' }).fee_cents, 3000);
  const comp = fee(['1A', 'X'], { comp: 50, source: 'walk_up' });
  assert.deepEqual([comp.fee_cents, comp.walk_up_surcharge, comp.comp_base_fee_cents], [2500, false, 5000]);
  assert.equal(fee(['1A'], { comp: 100 }).is_comp, true);
});

test('selection rules come from the config', () => {
  assert.deepEqual(selectionIssues(['1A'], {}, competition), []);
  assert.deepEqual(selectionIssues(['X'], { X: ['2A', '4A'] }, competition), []);
  const msg = (divs, st) => selectionIssues(divs, st, competition).map((i) => i.message);
  assert.match(msg(['X'], {})[0], /Choose 1–2 X Division styles/);
  assert.match(msg(['X'], { X: ['2A', '3A', '4A'] })[0], /Choose 1–2/);
  assert.match(msg(['X'], { X: ['9A'] })[0], /Unknown X Division style/);
  assert.match(msg(['SBJ', '1A'], {})[0], /can't be combined/);
  assert.match(msg(['1A'], { X: ['2A'] })[0], /isn't selected/);
  assert.match(msg(['NOPE'], {})[0], /Unknown division/);
  assert.match(msg([], {})[0], /at least one/);
  assert.deepEqual(cleanStyles(['X'], { X: ['2A', '2A'], '1A': ['x'], SBJ: [] }), { X: ['2A'] });
});

test('scoring: style multipliers, deductions, manual clamp', () => {
  const x = competition.divisions.find((d) => d.code === 'X');
  assert.equal(effectiveStyle(null, ['2A']), '2A');
  assert.equal(effectiveStyle(null, ['2A', '3A']), null);
  assert.equal(effectiveStyle('3A', ['2A', '3A']), '3A');
  assert.equal(styleMultiplier(x, '4A'), 1.3);
  assert.equal(styleMultiplier(x, null), 1);
  const sheet = { tech_execution_raw: 50, trick_presentation: 7, performance_quality: 7, musicality: 7, routine_construction: 7, stop_count: 0, discard_count: 0, detach_count: 1 };
  // Matches the contest_results view: 50 × 1.3 / 70 × 60 = 55.71; 55.71 + 28 − 5 = 78.71
  assert.deepEqual(freestyleBreakdown(sheet, x.scoring, 1.3, 70), { tech_execution_normalized: 55.71, total_eval: 28, deduction_points: 5, final_score: 78.71 });
  const sbj = competition.divisions.find((d) => d.code === 'SBJ');
  assert.equal(freestyleBreakdown({ ...sheet, stop_count: 9 }, sbj.scoring, 1, 50).deduction_points, 0);
  assert.equal(manualBreakdown(120, { format: 'manual', max: 100 }).final_score, 100);
  assert.equal(manualBreakdown(-3, { format: 'manual', max: 100 }).final_score, 0);
});

test('the default config and every preset are valid', () => {
  assert.deepEqual(configIssues(competition), []);
  for (const [name, c] of Object.entries(PRESETS)) {
    assert.deepEqual(configIssues(c), [], name);
    assert.match(divisionsSql(c), /insert into public\.vsyc_divisions/, name);
  }
});

test('configIssues catches bad codes, duplicates and dangling references', () => {
  const bad = structuredClone(competition);
  bad.divisions[1].code = '1A';
  bad.divisions[2].cannotCombineWith = ['ZZ'];
  bad.divisions.push({ ...bad.divisions[0], code: 'has space' });
  bad.combos.push({ divisions: ['1A'], priceCents: 1 });
  const issues = configIssues(bad).join('\n');
  for (const re of [/Duplicate division code "1A"/, /unknown division "ZZ"/, /"has space" must be/, /at least two/]) assert.match(issues, re);
  assert.throws(() => divisionsSql(bad), /competition block/);
});

test('supabase/divisions.sql is up to date (run `npm run divisions`)', () => {
  assert.equal(readFileSync(new URL('../supabase/divisions.sql', import.meta.url), 'utf8'), divisionsSql(competition));
});

test('SQL escapes quotes in names', () => {
  const c = structuredClone(competition);
  c.divisions[0].name = "Rock 'n' Roll";
  assert.match(divisionsSql(c), /'Rock ''n'' Roll'/);
});

test('maxTotalStyles: unstyled divisions count as one style, styled ones count their picks', async () => {
  const { styleCap } = await import('./divisions-core.ts');
  const c = { ...competition, maxTotalStyles: 2 };
  const ok = (divs, styles = {}) => selectionIssues(divs, styles, c).length === 0;
  const x = competition.divisions.find((d) => d.code === 'X');
  const [s1, s2] = x.styles.options.map((o) => o.code);
  assert.ok(ok(['X'], { X: [s1, s2] }));
  assert.ok(ok(['1A', 'X'], { X: [s1] }));
  assert.ok(!ok(['1A', 'X'], { X: [s1, s2] }));
  assert.equal(styleCap('X', ['X'], {}, c), 2);
  assert.equal(styleCap('X', ['1A', 'X'], {}, c), 1);
  // Off when the config sets no cap.
  assert.equal(styleCap('X', ['1A', 'X'], {}, { ...competition, maxTotalStyles: undefined }), x.styles.max);
});
