// Unit tests for per-division result releases and the live schedule feed shaping.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublished, anyPublished, releaseKey, visibilityFrom } from './results-visibility-core.ts';
import { feedItem, runOrderSnapshot } from './schedule-feed-core.ts';
import { liveSchedule } from './schedule-core.ts';

test('the global flag publishes everything', () => {
  const vis = visibilityFrom(true, []);
  assert.equal(isPublished(vis, '1A'), true);
  assert.equal(isPublished(vis, '1A', 3), true);
  assert.equal(anyPublished(vis), true);
});

test('a release publishes only that division and round', () => {
  const vis = visibilityFrom(false, [{ division: '1A', round: 1 }, { division: 'X', round: null }]);
  assert.equal(releaseKey('X'), 'X:1');
  assert.equal(isPublished(vis, '1A', 1), true);
  assert.equal(isPublished(vis, '1A', 2), false);
  assert.equal(isPublished(vis, '1A'), true, 'any round counts when no round is given');
  assert.equal(isPublished(vis, 'X', 1), true, 'a null round is round 1');
  assert.equal(isPublished(vis, 'SBJ'), false);
  // A prefix of another code must not match ("1" vs "1A").
  assert.equal(isPublished(vis, '1'), false);
  assert.equal(anyPublished(visibilityFrom(false, [])), false);
});

test('runOrderSnapshot: on stage, next two on deck by position, progress', () => {
  const rows = [
    { position: 4, status: 'upcoming', display_name: 'D' },
    { position: 1, status: 'done', display_name: 'A' },
    { position: 3, status: 'upcoming', display_name: 'C', style: '2A' },
    { position: 2, status: 'performing', display_name: 'B' },
    { position: 5, status: 'upcoming', display_name: 'E' },
  ];
  const s = runOrderSnapshot('1A', 1, rows);
  assert.deepEqual(s.performing, { position: 2, display_name: 'B', style: null });
  assert.deepEqual(s.on_deck.map((p) => p.display_name), ['C', 'D']);
  assert.equal(s.on_deck[0].style, '2A');
  assert.equal(s.done, 1);
  assert.equal(s.total, 5);
});

test('runOrderSnapshot before the first performer and after the last', () => {
  const before = runOrderSnapshot('X', 2, [{ position: 1, status: 'upcoming', display_name: 'A' }]);
  assert.equal(before.performing, null);
  assert.equal(before.on_deck.length, 1);
  assert.equal(before.round, 2);
  const after = runOrderSnapshot('X', 1, [{ position: 1, status: 'done', display_name: 'A' }]);
  assert.equal(after.performing, null);
  assert.deepEqual(after.on_deck, []);
  assert.equal(after.done, after.total);
});

test('feedItem serializes times and only links results that are out', () => {
  const at = (hhmm) => new Date(`2027-03-13T${hhmm}:00Z`);
  const [judged, plain] = liveSchedule(
    [{ id: 'a', title: 'A', start: '10:00', minutes: 30, division: '1A' }, { id: 'b', title: 'B', start: '10:30', minutes: 30 }],
    [], at('09:00'), at,
  );
  const hidden = feedItem(judged, false);
  assert.equal(hidden.est_start, '2027-03-13T10:00:00.000Z');
  assert.equal(hidden.round, 1);
  assert.equal(hidden.results_url, null);
  assert.equal(feedItem(judged, true).results_url, '/results#div-1A');
  const p = feedItem(plain, true);
  assert.equal(p.division, null);
  assert.equal(p.round, null);
  assert.equal(p.results_url, null);
});
