// The scoring-format capability table (lib/divisions-core.ts): consistent, and covering every format the presets use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, formatCaps, supportsRounds, usesRunOrder, usesScoreSheet } from './divisions-core.ts';
import { competition } from '../contest.config.ts';
import { PRESETS } from '../presets/competitions.ts';

test('the capabilities fit together', () => {
  for (const [name, c] of Object.entries(FORMATS)) {
    assert.ok(c.label, `${name} has a label`);
    // A score sheet needs a run order to follow; rounds only make sense on a score sheet.
    if (c.scoreSheet) assert.ok(c.runOrder, `${name}: a score sheet needs a run order`);
    if (c.rounds) assert.ok(c.scoreSheet, `${name}: rounds need a score sheet`);
    // A format with its own screen doesn't use the shared sheet.
    if (c.ownScreen) assert.equal(c.scoreSheet, false, `${name}: own screen means no shared sheet`);
  }
});

test('every format the shipped config and the presets use has capabilities', () => {
  const used = new Set(competition.divisions.map((d) => d.scoring.format));
  for (const preset of Object.values(PRESETS)) for (const d of preset.divisions) used.add(d.scoring.format);
  assert.ok(used.size >= 6, 'the presets exercise every format');
  for (const f of used) assert.ok(FORMATS[f], `no capabilities for format "${f}"`);
});

test('the helpers agree with the table', () => {
  assert.deepEqual(['freestyle', 'panel', 'manual', 'ladder', 'bracket', 'showcase'].map(usesScoreSheet), [true, true, true, false, false, false]);
  assert.deepEqual(['freestyle', 'showcase', 'bracket'].map(usesRunOrder), [true, true, false]);
  assert.deepEqual(['freestyle', 'ladder'].map(supportsRounds), [true, false]);
  assert.equal(usesScoreSheet(undefined), false);
  assert.equal(formatCaps('bracket').label, 'Battle bracket');
});
