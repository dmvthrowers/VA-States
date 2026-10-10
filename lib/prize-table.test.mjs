// Prize table (master plan S3). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prizeTable } from './prize-table.ts';

const div = (code, extra = {}, format = 'freestyle') => ({ code, name: code, scoring: { format }, ...extra });
const defaults = { places: 3, championState: 'IL' };

test('a division with no tiers gets the contest default', () => {
  const [r] = prizeTable([div('1A')], defaults);
  assert.deepEqual(r.lines, ['Top 3 places']);
  assert.equal(r.champion, true);
});

test('tiers read as ranges of entrants', () => {
  const [r] = prizeTable([div('X', { prizes: { tiers: [{ upTo: 5, places: 1 }, { upTo: 10, places: 3 }, { places: 5 }] } })], defaults);
  assert.deepEqual(r.lines, ['Up to 5 entrants: 1st place', '6 to 10 entrants: top 3 places', '11 or more entrants: top 5 places']);
});

test('a single-step range and a lone catch-all tier', () => {
  assert.deepEqual(prizeTable([div('A', { prizes: { tiers: [{ upTo: 1, places: 1 }, { upTo: 2, places: 2 }, { places: 3 }] } })], defaults)[0].lines,
    ['Up to 1 entrant: 1st place', '2 entrants: top 2 places', '3 or more entrants: top 3 places']);
  assert.deepEqual(prizeTable([div('B', { prizes: { tiers: [{ places: 2 }] } })], defaults)[0].lines, ['Any number of entrants: top 2 places']);
});

test('zero places reads as no prizes', () => {
  assert.deepEqual(prizeTable([div('C', { prizes: { tiers: [{ upTo: 2, places: 0 }, { places: 3 }] } })], defaults)[0].lines,
    ['Up to 2 entrants: no prizes', '3 or more entrants: top 3 places']);
});

test('showcase divisions are left out; the champion prize can be turned off or absent', () => {
  const rows = prizeTable([div('S', {}, 'showcase'), div('D', { prizes: { champion: false } })], defaults);
  assert.deepEqual(rows.map((r) => r.code), ['D']);
  assert.equal(rows[0].champion, false);
  assert.equal(prizeTable([div('E')], { places: 3, championState: '' })[0].champion, false);
});
