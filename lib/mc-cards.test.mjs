// MC cards (master plan T4). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcCards as build } from './mc-cards.ts';
import { isNameRestricted, publicDisplayName } from './display-name.ts';

const buildMcCards = (rows) => build(rows, { isNameRestricted, publicDisplayName });

const adult = { position: 2, status: 'upcoming', first_name: 'Sam', last_name: 'Rivera', city: 'Reston', state: 'VA', name_pronunciation: ' sam riv-AIR-ah ', intro_note: 'Three-time champ', sponsor_name: 'Acme Yo', club_affiliation: 'DMV Throwers', is_minor: false };
const minor = { position: 1, status: 'done', first_name: 'Kit', last_name: 'Lopez', city: 'Reston', state: 'VA', name_pronunciation: 'kit LOW-pez', is_minor: true, is_public: false };

test('sorted by run order, every field carried for an adult', () => {
  const cards = buildMcCards([adult, minor]);
  assert.deepEqual(cards.map((c) => c.position), [1, 2]);
  const a = cards[1];
  assert.equal(a.name, 'Sam Rivera');
  assert.equal(a.say_as, 'sam riv-AIR-ah');
  assert.equal(a.intro, 'Three-time champ');
  assert.equal(a.sponsor, 'Acme Yo');
  assert.equal(a.club, 'DMV Throwers');
  assert.equal(a.from, 'Reston, VA');
  assert.equal(a.restricted, false);
});

test('a minor who is not public: short name, no location, no pronunciation', () => {
  const m = buildMcCards([minor])[0];
  assert.equal(m.name, 'Kit L.');
  assert.equal(m.from, null);
  assert.equal(m.say_as, null);
  assert.equal(m.restricted, true);
});

test('a minor whose guardian opted in is treated like an adult', () => {
  const m = buildMcCards([{ ...minor, is_public: true }])[0];
  assert.equal(m.name, 'Kit Lopez');
  assert.equal(m.say_as, 'kit LOW-pez');
  assert.equal(m.restricted, false);
});

test('blank fields become null', () => {
  const c = buildMcCards([{ position: 1, status: 'upcoming', first_name: 'A', last_name: 'B', intro_note: '  ', sponsor_name: '' }])[0];
  assert.equal(c.intro, null);
  assert.equal(c.sponsor, null);
  assert.equal(c.say_as, null);
  assert.equal(c.from, null);
});
