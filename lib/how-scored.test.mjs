// How it was scored and score shading (master plan T11, T12). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { howScored, shadeValues } from './how-scored.ts';
import { competition } from '../contest.config.ts';

test('every division in the config explains itself', () => {
  for (const d of competition.divisions) {
    const h = howScored(d);
    assert.ok(h.headline.length > 0, d.code);
    assert.ok(h.notes.length > 0, d.code);
  }
});

test('freestyle words use the division\'s own numbers', () => {
  const d = { code: 'F', name: 'F', scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: { stop: 1, discard: 3, detach: 5 } } };
  const h = howScored(d);
  assert.equal(h.headline, 'Freestyle, scored out of 100');
  assert.ok(h.notes.some((n) => n.includes('out of 60') && n.includes('each miss')));
  assert.ok(h.notes.some((n) => n.includes('1 point for each stop') && n.includes('3 points for each discard') && n.includes('5 points for each detach')));
});

test('no deductions: no deduction line', () => {
  const d = { code: 'F', name: 'F', scoring: { format: 'freestyle', techCap: 20, evalCap: 20, negativeClicks: false, deductions: null } };
  assert.ok(!howScored(d).notes.some((n) => n.startsWith('Deductions')));
});

test('timed manual division says lower is better', () => {
  const d = { code: 'S', name: 'S', scoring: { format: 'manual', max: 60, better: 'lower', unit: 'seconds', attempts: 3 } };
  const h = howScored(d);
  assert.equal(h.headline, 'Timed: lowest seconds wins');
  assert.ok(h.notes[0].includes('3 attempts') && h.notes[0].includes('lowest'));
});

test('shading: best is 1, worst is 0, flipped for lower-is-better', () => {
  assert.deepEqual(shadeValues([90, 80, 70], 'higher'), [1, 0.5, 0]);
  assert.deepEqual(shadeValues([7, 8, 9], 'lower'), [1, 0.5, 0]);
});

test('shading: ties and tiny lists', () => {
  assert.deepEqual(shadeValues([], 'higher'), []);
  assert.deepEqual(shadeValues([5], 'higher'), [0]);
  assert.deepEqual(shadeValues([5, 5, 5], 'higher'), [0, 0, 0]);
});
