import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('source check reports syntax errors and unresolved local imports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'schematica-check-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'broken.js'), "import './missing.js';\nexport const value = ;\n");
    const { checkSource } = await import('../scripts/check-source.mjs');
    const issues = await checkSource(root, ['src']);
    assert.ok(issues.some(issue => issue.includes('broken.js') && issue.includes('syntax')));
    assert.ok(issues.some(issue => issue.includes('broken.js') && issue.includes('missing.js')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source check identifies production modules unreachable from the browser entrypoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'schematica-check-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.js'), "import './used.js';\n");
    await writeFile(join(root, 'src', 'used.js'), 'export const used = true;\n');
    await writeFile(join(root, 'src', 'orphan.js'), 'export const orphan = true;\n');
    const { checkSource } = await import('../scripts/check-source.mjs');
    const issues = await checkSource(root, ['src']);
    assert.ok(issues.some(issue => issue.includes('orphan.js') && issue.includes('unreachable')));
    assert.ok(!issues.some(issue => issue.includes('used.js')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source lint flags trailing whitespace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'schematica-check-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.js'), 'export const value = 1;  \n');
    const { checkSource } = await import('../scripts/check-source.mjs');
    const issues = await checkSource(root, ['src']);
    assert.ok(issues.some(issue => issue.includes('main.js:1') && issue.includes('trailing whitespace')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
