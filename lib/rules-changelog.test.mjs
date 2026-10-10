// Rules with a changelog (master plan O5). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesPageIssues, longDateOf } from './rules-changelog.ts';
import { contest } from '../contest.config.ts';

const ok = { enabled: true, version: '1.1', publishedOn: '2027-01-01', changes: [
  { version: '1.1', date: '2027-02-01', summary: ['Time limit is now 2 minutes.'] },
  { version: '1.0', date: '2027-01-01', summary: ['First published.'] },
] };

test('the shipped config is sound', () => {
  assert.deepEqual(rulesPageIssues(contest.rulesPage), []);
});

test('a sound page has no issues', () => {
  assert.deepEqual(rulesPageIssues(ok), []);
});

test('catches a version that does not match the newest change', () => {
  assert.match(rulesPageIssues({ ...ok, version: '2.0' })[0], /newest change is 1\.1/);
});

test('catches bad dates, repeats, blanks and wrong order', () => {
  const bad = { ...ok, publishedOn: 'Jan 1', changes: [
    { version: '1.0', date: '2027-01-01', summary: ['a'] },
    { version: '1.1', date: '2027-02-01', summary: [' '] },
    { version: '1.1', date: '27-02-01', summary: ['b'] },
  ] };
  const issues = rulesPageIssues(bad).join('|');
  assert.match(issues, /publishedOn/);
  assert.match(issues, /appears twice/);
  assert.match(issues, /say what changed/);
  assert.match(issues, /date must be/);
  assert.match(issues, /newest first/);
});

test('long dates ignore the reader time zone', () => {
  assert.equal(longDateOf('2027-01-15'), 'January 15, 2027');
});
