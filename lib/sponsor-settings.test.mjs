// Editable sponsor form settings: ids, validation, fallback to defaults, renames. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSettings, normalizeSettings, renamedTiers } from './sponsor-settings.ts';
import { inquirySchema, tierAvailability } from './sponsor-inquiry.ts';

const base = { enabled: true, intro: 'Hi', tiers: [{ id: 'gold', label: 'Gold', amount: '$500+', slots: 2 }], otherChoices: [{ label: 'Not sure yet' }], contactMethods: ['Email'], paymentMethods: ['Check'], heardFrom: [] };

test('new tiers and choices get stable unique ids from their names', () => {
  const s = normalizeSettings({ ...base, tiers: [...base.tiers, { label: 'Title Sponsor', amount: '$5,000' }, { label: 'Title-Sponsor', amount: '$1' }] });
  assert.deepEqual(s.tiers.map((t) => t.id), ['gold', 'title_sponsor', 'title_sponsor_2']);
  assert.equal(s.otherChoices[0].id, 'not_sure_yet');
});

test('an existing id is kept when the tier is renamed or repriced', () => {
  const s = normalizeSettings({ ...base, tiers: [{ id: 'gold', label: 'Premier', amount: '$750+' }] });
  assert.equal(s.tiers[0].id, 'gold');
  assert.deepEqual(renamedTiers(base.tiers, s.tiers), [{ from: 'Gold', to: 'Premier' }]);
  assert.deepEqual(renamedTiers(base.tiers, base.tiers), []);
});

test('bad settings are refused with a plain message', () => {
  assert.throws(() => normalizeSettings({ ...base, tiers: [] }), /at least one tier/i);
  assert.throws(() => normalizeSettings({ ...base, tiers: [{ label: 'A', amount: '1' }, { label: 'a', amount: '2' }] }), /same name/i);
  assert.throws(() => normalizeSettings({ ...base, tiers: [{ id: 'x', label: 'A', amount: '1' }, { id: 'x', label: 'B', amount: '1' }] }), /share an id/i);
  assert.throws(() => normalizeSettings({ ...base, tiers: [{ label: 'A', amount: '1', slots: 0 }] }));
  assert.throws(() => normalizeSettings({ ...base, tiers: [{ label: 'A', amount: '1', extra: 1 }] }));
});

test('a missing or broken saved copy falls back to the defaults', () => {
  const d = normalizeSettings(base);
  assert.equal(effectiveSettings(d, null), d);
  assert.equal(effectiveSettings(d, { nonsense: true }), d);
  assert.equal(effectiveSettings(d, { ...base, intro: 'Changed' }).intro, 'Changed');
});

test('the form and slot counts follow the edited tiers, perks included', () => {
  const s = normalizeSettings({ ...base, tiers: [{ id: 'gold', label: 'Premier', amount: '$750+', slots: 1, perks: ['Banner', 'Mic mention'] }] });
  assert.ok(inquirySchema(s).safeParse({ first_name: 'A', last_name: 'B', email: 'a@b.co', brand_name: 'C', tier: 'gold' }).success);
  assert.ok(!inquirySchema(s).safeParse({ first_name: 'A', last_name: 'B', email: 'a@b.co', brand_name: 'C', tier: 'silver' }).success);
  const [t] = tierAvailability(s.tiers, [{ tier: 'premier', status: 'paid' }]);
  assert.equal(t.full, true);
  assert.deepEqual(t.perks, ['Banner', 'Mic mention']);
});
