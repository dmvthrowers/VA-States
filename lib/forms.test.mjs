// Forms on our own system: config checks, validation from a field list, the honeypot, cleaned answers. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerLines, formIssues, parseSubmission, publicForm } from './forms.ts';

const form = {
  id: 'contact',
  title: 'Contact',
  enabled: true,
  fields: [
    { id: 'name', label: 'Your name', type: 'text', required: true },
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'phone', label: 'Phone', type: 'phone' },
    { id: 'site', label: 'Website', type: 'url' },
    { id: 'topic', label: 'Topic', type: 'select', options: ['Sponsor', 'Volunteer'] },
    { id: 'days', label: 'Days', type: 'multiselect', options: ['Fri', 'Sat'] },
    { id: 'count', label: 'How many', type: 'number' },
    { id: 'note', label: 'Message', type: 'longtext', max: 50 },
    { id: 'agree', label: 'I agree', type: 'checkbox', required: true },
  ],
};
const ok = { name: ' Ada ', email: ' ADA@Example.com ', agree: true };

test('a minimal valid submission passes and is cleaned up', () => {
  const r = parseSubmission(form, ok);
  assert.ok(r.ok);
  assert.deepEqual(r.answers, { name: 'Ada', email: 'ada@example.com', agree: true });
  assert.equal(r.bot, false);
});

test('required fields are refused with the field name in the message', () => {
  assert.match(parseSubmission(form, { ...ok, name: '' }).message, /Your name/);
  assert.match(parseSubmission(form, { ...ok, agree: false }).message, /I agree/);
  assert.match(parseSubmission(form, { name: 'A', agree: true }).message, /Email/);
});

test('each field type checks its own shape', () => {
  assert.ok(!parseSubmission(form, { ...ok, email: 'nope' }).ok);
  assert.ok(!parseSubmission(form, { ...ok, phone: 'call me' }).ok);
  assert.ok(parseSubmission(form, { ...ok, phone: '+1 (555) 010-2000' }).ok);
  assert.ok(!parseSubmission(form, { ...ok, site: 'javascript:alert(1)' }).ok);
  assert.ok(parseSubmission(form, { ...ok, site: 'https://example.org' }).ok);
  assert.ok(!parseSubmission(form, { ...ok, topic: 'Cats' }).ok);
  assert.ok(!parseSubmission(form, { ...ok, days: ['Sun'] }).ok);
  assert.ok(!parseSubmission(form, { ...ok, days: ['Fri', 'Fri'] }).ok);
  assert.ok(!parseSubmission(form, { ...ok, count: '3' }).ok, 'numbers must be numbers');
  assert.ok(!parseSubmission(form, { ...ok, note: 'x'.repeat(51) }).ok, 'max length');
});

test('unknown fields are refused, and empty optional values are dropped', () => {
  const r = parseSubmission(form, { ...ok, extra: 'x' });
  assert.ok(!r.ok);
  assert.match(r.message, /changed/i);
  const clean = parseSubmission(form, { ...ok, phone: '', topic: '', days: [], note: '' });
  assert.ok(clean.ok);
  assert.deepEqual(Object.keys(clean.answers).sort(), ['agree', 'email', 'name']);
});

test('the honeypot passes validation but is flagged as a bot', () => {
  const r = parseSubmission(form, { ...ok, _hp: 'buy now' });
  assert.ok(r.ok);
  assert.equal(r.bot, true);
  assert.ok(!('_hp' in r.answers), 'the honeypot is never saved');
  const blank = parseSubmission(form, { ...ok, _hp: '' });
  assert.ok(blank.ok);
  assert.equal(blank.bot, false);
});

test('config problems are named in plain words', () => {
  assert.deepEqual(formIssues([form]), []);
  const bad = formIssues([
    { ...form, id: 'Bad Id' },
    { ...form, id: 'x', fields: [{ id: 'A', label: 'a', type: 'text' }, { id: 'b', label: '', type: 'nope' }, { id: 'c', label: 'c', type: 'select' }, { id: 'd', label: 'd', type: 'text', options: ['x'] }] },
    { ...form, id: 'x', fields: [] },
  ]);
  assert.ok(bad.some((m) => /lowercase letters, numbers and dashes/.test(m)));
  assert.ok(bad.some((m) => /appears twice/.test(m)));
  assert.ok(bad.some((m) => /not a field type/.test(m)));
  assert.ok(bad.some((m) => /at least two options/.test(m)));
  assert.ok(bad.some((m) => /only select fields take options/.test(m)));
  assert.ok(bad.some((m) => /no fields/.test(m)));
  assert.ok(formIssues([{ ...form, fields: [{ id: '_hp', label: 'x', type: 'text' }] }]).length > 0, 'the honeypot name is reserved');
});

test('answer lines are labelled and in field order; the public form hides nothing it should not', () => {
  const lines = answerLines(form, { agree: true, name: 'Ada', days: ['Fri', 'Sat'] });
  assert.deepEqual(lines, ['Your name: Ada', 'Days: Fri, Sat', 'I agree: yes']);
  const pub = publicForm(form);
  assert.equal(pub.submitLabel, 'Send');
  assert.ok(!('enabled' in pub));
});

test('the forms in contest.config.ts are valid', async () => {
  const { contest } = await import('../contest.config.ts');
  assert.deepEqual(formIssues(contest.forms), []);
});
