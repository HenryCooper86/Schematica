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

test('review-ready mode blocks undeclared and empty boards while default and strict keep their existing policy', async () => {
  const { EXAMPLES } = await import('../src/examples.js');
  const dir = await mkdtemp(join(tmpdir(), 'schematica-ready-'));
  try {
    const file = join(dir, 'board.json');
    await writeFile(file, JSON.stringify(EXAMPLES.find(e => e.id === 'rdk-x5-inspection').doc));
    assert.equal(run('--strict', file).status, 0);
    let result = run('--review-ready', '--json', file);
    assert.equal(result.status, 1);
    let report = JSON.parse(result.stdout).reports[0];
    assert.equal(report.reviewReady, false);
    assert.equal(report.coverage.unassessed, 4);
    const declared = structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
    await writeFile(file, JSON.stringify(declared));
    result = run('--review-ready', '--strict', '--json', file);
    assert.equal(result.status, 0);
    report = JSON.parse(result.stdout).reports[0];
    assert.equal(report.reviewReady, true);
    assert.equal(report.coverage.checked, 4);
    assert.match(run(file).stdout, /Interface coverage: 4 checked/);
    declared.nodes[1].interfacePorts.left.rateBps = 9600;
    await writeFile(file, JSON.stringify(declared));
    assert.equal(run('--review-ready', file).status, 1);
    await writeFile(file, JSON.stringify(newDoc()));
    assert.equal(run('--review-ready', file).status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
