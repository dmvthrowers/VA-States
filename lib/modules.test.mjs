// The run-sheet modules and the portal menu agree on who gets in. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, MODULE_IDS, isModuleId } from './modules.ts';
import { CAPABILITIES, PORTALS, can, grantsFromLegacyRole } from './roles.ts';

test('every module needs real capabilities, and its portal asks for the same ones', () => {
  for (const id of MODULE_IDS) {
    for (const c of MODULES[id].needs) assert.ok(CAPABILITIES.includes(c), `${id}: unknown capability ${c}`);
    const portal = PORTALS.find((p) => p.id === id);
    assert.ok(portal, `${id} has a portal`);
    assert.deepEqual([...portal.needs].sort(), [...MODULES[id].needs].sort(), `${id} portal needs match`);
    assert.equal(portal.ready, true, `${id} portal is ready`);
    assert.equal(portal.href, `/${id}`);
  }
});

test('admin reaches every module and the module roles reach only their own', () => {
  const holds = (role, id) => MODULES[id].needs.some((c) => can(grantsFromLegacyRole(role), c));
  for (const id of MODULE_IDS) assert.ok(holds('admin', id), `admin ${id}`);
  assert.ok(holds('mc', 'mc') && !holds('mc', 'merch') && !holds('mc', 'stream'));
  assert.ok(holds('merch', 'merch') && !holds('merch', 'mc'));
  assert.ok(holds('stream_tech', 'stream') && holds('streamer', 'stream'));
  assert.ok(holds('media', 'media') && !holds('media', 'stream'));
  assert.ok(!holds('judge', 'merch') && !holds('sponsor', 'mc'));
});

test('module ids are checked', () => {
  assert.ok(isModuleId('mc') && !isModuleId('admin') && !isModuleId(undefined));
});
