// Privacy rules for public names. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restrictedDisplayName, publicDisplayName } from './display-name.ts';

test('a non-public minor never shows a legal full name, even as their bracket name', () => {
  const kid = { first_name: 'Sam', last_name: 'Rivera', is_minor: true, is_public: false };
  assert.equal(publicDisplayName({ ...kid, preferred_bracket_name: 'Sam Rivera' }), 'Sam R.');
  assert.equal(publicDisplayName({ ...kid, preferred_bracket_name: 'sam rivera' }), 'Sam R.');
  assert.equal(publicDisplayName({ ...kid, preferred_bracket_name: 'Sammy R' }), 'Sammy R');
  assert.equal(restrictedDisplayName({ ...kid, nickname: 'Spinner' }), 'Spinner');
  assert.equal(publicDisplayName({ ...kid, is_public: true, preferred_bracket_name: 'Sam Rivera' }), 'Sam Rivera');
});
