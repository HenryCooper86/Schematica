import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newDoc, Store, addNode } from '../src/state.js';

const script = new URL('../scripts/check-board.mjs', import.meta.url);
const run = (...args) => spawnSync(process.execPath, [fileURLToPath(script), ...args], { encoding: 'utf8' });
test('board CLI checks files, reports import repairs, and returns actionable exit codes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'schematica-check-'));
  try {
    const clean = join(dir, 'clean.json'), bad = join(dir, 'bad.json'), repaired = join(dir, 'repaired.json');
    await writeFile(clean, JSON.stringify(newDoc('Clean')));
    await writeFile(bad, '{invalid');
    await writeFile(repaired, JSON.stringify({ nodes: [{ id: 'missing-position' }] }));
    assert.equal(run(clean).status, 0);
    const result = run('--json', clean, repaired, bad);
    assert.equal(result.status, 2);
    const reports = JSON.parse(result.stdout).reports;
    assert.deepEqual(reports.map(r => r.passed), [true, false, false]);
    assert.ok(reports[1].warnings.length);
    assert.match(reports[2].error, /could not parse JSON/);
    assert.equal(run(repaired).status, 1);
    assert.equal(run().status, 2);
    assert.equal(run(join(dir, 'absent.json')).status, 2);
    const store = new Store(); addNode(store, 'mcu', 0, 0);
    await writeFile(clean, JSON.stringify(store.doc));
    const regular = run('--json', clean), strict = run('--json', '--strict', clean);
    assert.equal(regular.status, 0);
    assert.ok(JSON.parse(regular.stdout).reports[0].findings.some(f => f.level === 'warning'));
    assert.equal(strict.status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
