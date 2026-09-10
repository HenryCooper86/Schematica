import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// The repo is public: it must say what others may do with it, and what it
// took from others.
test('the repo carries an MIT licence naming the author, and package.json agrees', () => {
  assert.ok(existsSync('LICENSE'), 'LICENSE file');
  const text = readFileSync('LICENSE', 'utf8');
  assert.match(text, /^MIT License/);
  assert.match(text, /Copyright \(c\) 2026 HenryCooper86/);
  assert.match(text, /Permission is hereby granted, free of charge/);
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).license, 'MIT');
});

test('third-party notices cover the Lucide icon set under its ISC licence', () => {
  assert.ok(existsSync('THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md');
  const text = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  assert.match(text, /Lucide/);
  assert.match(text, /ISC License/);
  assert.match(text, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(text, /src\/palette\.js/);
});
