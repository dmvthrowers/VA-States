// Do-not-photograph list (master plan R11). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doNotPhotograph } from './media-consent.ts';

const row = (name, consent, extra = {}) => ({ name, kind: 'competitor', is_minor: false, divisions: [], photo_video_consent: consent, ...extra });

test('only people without consent, sorted by name', () => {
  const out = doNotPhotograph([row('Zed', false), row('Amy', true), row('Bo', false, { is_minor: true, divisions: ['SBJ'] })]);
  assert.deepEqual(out.map((r) => r.name), ['Bo', 'Zed']);
  assert.deepEqual(out[0], { name: 'Bo', kind: 'competitor', is_minor: true, divisions: ['SBJ'] });
});

test('nobody opted out: empty list', () => {
  assert.deepEqual(doNotPhotograph([row('Amy', true)]), []);
});

test('the consent flag itself is not passed along', () => {
  assert.equal('photo_video_consent' in doNotPhotograph([row('Amy', false)])[0], false);
});
