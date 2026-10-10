// Run: node --experimental-strip-types --test lib/turnstile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutTurnstileToken } from './turnstile.ts';

test('withoutTurnstileToken drops only the token and leaves other bodies alone', () => {
  assert.deepEqual(withoutTurnstileToken({ a: 1, turnstileToken: 't' }), { a: 1 });
  assert.deepEqual(withoutTurnstileToken({ a: 1 }), { a: 1 });
  assert.equal(withoutTurnstileToken(null), null);
  assert.deepEqual(withoutTurnstileToken([1]), [1]);
  assert.equal(withoutTurnstileToken('x'), 'x');
});
