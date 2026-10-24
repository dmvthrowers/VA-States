// zod 4 with zod 3's default messages: the routes and forms show these to people, so they must not change. Run: npm test
// Every expected string below is what zod 3.25 said for the same schema and input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from './zod.ts';

const first = (schema, input) => {
  const r = schema.safeParse(input);
  assert.ok(!r.success, `expected ${JSON.stringify(input)} to fail`);
  return r.error.issues[0].message;
};

test('missing and wrong-type values', () => {
  const s = z.object({ name: z.string().trim().min(1).max(50), age: z.number().int().min(1).max(120), ok: z.boolean() });
  assert.equal(first(s, { age: 1, ok: true }), 'Required');
  assert.equal(first(s, { name: 5, age: 1, ok: true }), 'Expected string, received number');
  assert.equal(first(s, { name: {}, age: 1, ok: true }), 'Expected string, received object');
  assert.equal(first(s, { name: 'a', age: '3', ok: true }), 'Expected number, received string');
  assert.equal(first(s, { name: 'a', age: 1.5, ok: true }), 'Expected integer, received float');
  assert.equal(first(s, { name: 'a', age: 1, ok: null }), 'Expected boolean, received null');
  assert.equal(first(z.array(z.string()), 'x'), 'Expected array, received string');
  assert.equal(first(z.record(z.string(), z.number()), []), 'Expected object, received array');
});

test('sizes', () => {
  assert.equal(first(z.string().trim().min(1), ' '), 'String must contain at least 1 character(s)');
  assert.equal(first(z.string().max(50), 'x'.repeat(51)), 'String must contain at most 50 character(s)');
  assert.equal(first(z.string().trim().length(2), 'abc'), 'String must contain exactly 2 character(s)');
  assert.equal(first(z.number().min(1), 0), 'Number must be greater than or equal to 1');
  assert.equal(first(z.number().max(120), 121), 'Number must be less than or equal to 120');
  assert.equal(first(z.number().positive(), 0), 'Number must be greater than 0');
  assert.equal(first(z.array(z.string()).min(1), []), 'Array must contain at least 1 element(s)');
  assert.equal(first(z.array(z.string()).max(2), ['a', 'b', 'c']), 'Array must contain at most 2 element(s)');
});

test('formats', () => {
  assert.equal(first(z.string().trim().email(), 'not-an-email'), 'Invalid email');
  assert.equal(first(z.string().url(), 'www.x.com'), 'Invalid url');
  assert.equal(first(z.string().guid(), 'not-a-uuid'), 'Invalid uuid');
  assert.equal(first(z.string().regex(/^a$/), 'b'), 'Invalid');
  assert.equal(first(z.string().startsWith('https://'), 'http://x'), 'Invalid input: must start with "https://"');
  // zod 3's .uuid() took any hex; .guid() keeps that, so ids like this still pass.
  assert.ok(z.string().guid().safeParse('00000000-0000-0000-0000-000000000001').success);
});

test('enums, literals, unions, unknown keys', () => {
  assert.equal(first(z.enum(['early', 'late']), 'noon'), "Invalid enum value. Expected 'early' | 'late', received 'noon'");
  assert.equal(first(z.enum(['early', 'late']), 3), "Expected 'early' | 'late', received number");
  assert.equal(first(z.object({ e: z.enum(['early', 'late']) }), {}), 'Required');
  assert.equal(first(z.literal(true), false), 'Invalid literal value, expected true');
  assert.equal(first(z.object({ t: z.literal(true) }), {}), 'Invalid literal value, expected true');
  // zod 3 surfaced the branch that had the right type but failed a check
  assert.equal(first(z.string().email().optional().or(z.literal('')), 'nope'), 'Invalid email');
  assert.equal(first(z.string().email().optional().or(z.literal('')), 5), 'Invalid input');
  assert.equal(first(z.object({ a: z.string().optional() }).strict(), { a: 'x', b: 1, c: 2 }), "Unrecognized key(s) in object: 'b', 'c'");
  assert.equal(first(z.string().refine((v) => v !== 'x'), 'x'), 'Invalid input');
});

test('messages a schema sets itself win', () => {
  assert.equal(first(z.literal(true, { error: 'Liability waiver is required' }), undefined), 'Liability waiver is required');
  assert.equal(first(z.string().min(1, 'Enter a name'), ''), 'Enter a name');
  assert.equal(first(z.string().regex(/^\d+$/, 'Invalid phone number'), 'call me'), 'Invalid phone number');
});
