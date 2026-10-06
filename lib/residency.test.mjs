// Home-state eligibility for the state champion (site #82). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { US_STATES, US_STATE_CODES, isHomeStateEligible, isZip, residencyIssues } from './residency.ts';

test('DC is its own option, next to Virginia and Maryland', () => {
  assert.equal(US_STATES.length, 51);
  for (const c of ['DC', 'VA', 'MD']) assert.ok(US_STATE_CODES.includes(c));
  assert.equal(new Set(US_STATE_CODES).size, 51);
});

test('a Virginia resident who confirmed is eligible; anyone else is not', () => {
  assert.equal(isHomeStateEligible({ state: 'VA', home_state_confirmed: true }, 'VA'), true);
  assert.equal(isHomeStateEligible({ state: 'va', home_state_confirmed: true }, 'VA'), true);
  assert.equal(isHomeStateEligible({ state: 'VA', home_state_confirmed: false }, 'VA'), false);
  assert.equal(isHomeStateEligible({ state: 'VA' }, 'VA'), false);
  assert.equal(isHomeStateEligible({ state: 'DC', home_state_confirmed: true }, 'VA'), false);
  assert.equal(isHomeStateEligible({ state: 'MD', home_state_confirmed: true }, 'VA'), false);
});

test("an organizer's override wins either way", () => {
  assert.equal(isHomeStateEligible({ state: 'DC', home_state_override: true }, 'VA'), true);
  assert.equal(isHomeStateEligible({ state: 'VA', home_state_confirmed: true, home_state_override: false }, 'VA'), false);
  assert.equal(isHomeStateEligible({ state: 'VA', home_state_confirmed: true, home_state_override: null }, 'VA'), true);
});

test("an empty champion state turns the title off", () => {
  assert.equal(isHomeStateEligible({ state: 'VA', home_state_confirmed: true, home_state_override: true }, ''), false);
});

test('ZIP codes', () => {
  assert.deepEqual(['20166', '20166-1234', ' 22201 '].map(isZip), [true, true, true]);
  assert.deepEqual(['2016', '201666', 'abcde', ''].map(isZip), [false, false, false, false]);
});

test('Virginia registrants need an address, a ZIP and the confirmation; others need none', () => {
  assert.deepEqual(residencyIssues({ state: 'MD' }, 'VA'), []);
  assert.deepEqual(residencyIssues({ state: 'DC' }, 'VA'), []);
  const issues = residencyIssues({ state: 'VA' }, 'VA').map((i) => i.field);
  assert.deepEqual(issues, ['home_address', 'home_zip', 'home_state_confirmed']);
  assert.deepEqual(residencyIssues({ state: 'VA', home_address: '1 Main St', home_zip: '22201', home_state_confirmed: true }, 'VA'), []);
  assert.deepEqual(residencyIssues({ state: 'VA', home_address: '1 Main St', home_zip: '2220', home_state_confirmed: true }, 'VA').map((i) => i.field), ['home_zip']);
});
