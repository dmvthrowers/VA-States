// Run: node --experimental-strip-types --test lib/events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvents, buildOrganizers, defaultEventFrom, defaultOrganizer, eventIssues, eventOf, organizerOf, slugify } from './events.ts';

const contest = {
  name: 'Springfield Yo-Yo Open', shortName: 'SYO-27', date: '2027-03-13', startTime: '10:00', endTime: '18:00',
  timeZone: 'America/Chicago',
  venue: { name: 'Springfield Civic Center', streetAddress: '200 Capitol Ave', city: 'Springfield', region: 'IL', postalCode: '62701', country: 'US' },
  deadlines: { earlyBird: '2027-02-13T00:00:00-06:00', onlineRegistration: '2027-03-11T23:59:59-06:00' },
  organizer: { name: 'Springfield Throwers', url: 'https://example.org' }, contactEmail: 'hello@example.org',
};
const jam = { id: 'spring-jam', organizerId: 'springfield-throwers', name: 'Spring Jam', shortName: 'SJ-27', dates: ['2027-05-01', '2027-05-02'],
  startTime: '09:00', endTime: '17:00', timeZone: 'America/Chicago', venue: { name: 'Park Hall', city: 'Springfield', region: 'IL' }, deadlines: {} };

test('slugify makes short lowercase ids that start with a letter', () => {
  assert.equal(slugify('VSYC-26'), 'vsyc-26');
  assert.equal(slugify('Spring Jam 2027!'), 'spring-jam-2027');
  assert.equal(slugify('2027 Open'), 'e-2027-open');
  assert.equal(slugify('!!!'), 'event');
  assert.ok(slugify('x'.repeat(80)).length <= 40);
});

test('the default event is today\'s single event, read from contest', () => {
  const e = defaultEventFrom(contest);
  assert.equal(e.id, 'syo-27');
  assert.deepEqual(e.dates, [contest.date]);
  for (const k of ['name', 'shortName', 'startTime', 'endTime', 'timeZone']) assert.equal(e[k], contest[k]);
  assert.deepEqual(e.venue, contest.venue);
  assert.deepEqual(e.deadlines, contest.deadlines);
  assert.equal(e.organizerId, defaultOrganizer(contest).id);
  assert.equal(defaultOrganizer(contest).contactEmail, 'hello@example.org');
  assert.equal(defaultEventFrom({ ...contest, eventId: 'vsyc26' }).id, 'vsyc26', 'an explicit id wins');
  e.venue.name = 'changed';
  assert.equal(contest.venue.name, 'Springfield Civic Center', 'the event is a copy, not the config object');
});

test('a deployment with no extra events has exactly one, and it is valid', () => {
  const events = buildEvents(contest);
  assert.equal(events.length, 1);
  assert.deepEqual(eventIssues(events, buildOrganizers(contest)), []);
});

test('extra events follow the default, and a request with no id gets the default', () => {
  const events = buildEvents(contest, [jam]);
  assert.deepEqual(events.map((e) => e.id), ['syo-27', 'spring-jam']);
  assert.equal(events[1].status, 'open');
  assert.equal(eventOf(events)?.id, 'syo-27');
  assert.equal(eventOf(events, '')?.id, 'syo-27');
  assert.equal(eventOf(events, 'spring-jam')?.id, 'spring-jam');
  assert.equal(eventOf(events, 'nope'), undefined, 'an unknown id is not quietly the default');
  assert.equal(organizerOf(buildOrganizers(contest), events[1])?.name, 'Springfield Throwers');
  assert.deepEqual(eventIssues(events, buildOrganizers(contest)), []);
});

test('problems are named in plain words', () => {
  const orgs = buildOrganizers(contest);
  const bad = (patch) => eventIssues(buildEvents(contest, [{ ...jam, ...patch }]), orgs).join(' | ');
  assert.match(bad({ id: 'Spring Jam' }), /short lowercase slug/);
  assert.match(bad({ id: 'syo-27' }), /listed twice/);
  assert.match(bad({ organizerId: 'ghost' }), /organizer "ghost" is not in the organizers list/);
  assert.match(bad({ dates: [] }), /at least one date/);
  assert.match(bad({ dates: ['2027-13-40'] }), /not a date/);
  assert.match(bad({ dates: ['2027-05-02', '2027-05-01'] }), /earliest first/);
  assert.match(bad({ startTime: '9am' }), /HH:MM/);
  assert.match(bad({ startTime: '18:00', endTime: '09:00' }), /after the start/);
  assert.match(bad({ timeZone: ' ' }), /time zone/);
  assert.match(bad({ deadlines: { earlyBird: 'soon' } }), /earlyBird/);
  assert.match(eventIssues([], orgs).join(' '), /at least one event/);
  assert.match(eventIssues(buildEvents(contest), [...orgs, orgs[0]]).join(' '), /listed twice/);
});
