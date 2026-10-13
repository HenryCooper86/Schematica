// Historical baseline probe, before the recovery fix. Run from the repository root.
// Current behavior is covered by tests/startup-recovery.test.js and e2e/reliability.mjs.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { Store, newDoc } from '../../../src/state.js';
import { deserialize } from '../../../src/serialize.js';
import { createAutosave } from '../../../src/autosave.js';
import { conflictStorage } from '../../../src/revisions.js';
import { EXAMPLES } from '../../../src/examples.js';
import { reviewReadiness } from '../../../src/validation-coverage.js';
import { interfaceCSV, importInterfaces } from '../../../src/engineering.js';

const main = execFileSync('git', ['show', 'fec15ad6adf4db82cce1a2e3735415b5f3b7ed7c:src/main.js'], { encoding: 'utf8' });
const start = main.indexOf('function loadAutosave()');
const end = main.indexOf('\nconst store =', start);
if (start < 0 || end < 0) throw new Error('Startup loader changed; update this probe.');
const loader = main.slice(start, end);
const reference = structuredClone(EXAMPLES.find(x => x.id === 'declared-uart-reference').doc);
const duplicate = structuredClone(reference);
duplicate.nodes.push({ ...duplicate.nodes[0], label: 'Second node with duplicate ID' });
const scenarios = [];
for (const [name, raw] of [
  ['unreadable-json', '{"nodes":'],
  ['repair-warning', JSON.stringify(duplicate)],
]) {
  const values = new Map([['schematica.autosave', raw]]);
  const log = [];
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const restored = vm.runInNewContext(loader + ';loadAutosave()', {
    localStorage: storage, deserialize, console: { warn: (...args) => log.push(String(args[0])) },
  });
  const store = new Store(restored || newDoc());
  const conflicts = [];
  const revisions = [];
  const persistence = conflictStorage(storage, {
    getDoc: () => store.doc,
    revisions: { save: (...args) => revisions.push(args) },
    onConflict: value => conflicts.push(value),
  });
  const statuses = [];
  const autosave = createAutosave({
    store, storage: persistence, onStatus: value => statuses.push(value),
    schedule: () => 0, cancel: () => {},
  });
  store.apply(doc => { doc.title = 'Edited after startup'; });
  autosave.flush();
  scenarios.push({
    name, consoleWarnings: log,
    sourceNodeCount: name === 'repair-warning' ? duplicate.nodes.length : null,
    loadedNodeCount: store.doc.nodes.length,
    originalAutosaveReplaced: values.get('schematica.autosave') !== raw,
    conflictCount: conflicts.length, conflictRevisions: revisions.length,
    status: statuses.at(-1),
  });
}
const csv = interfaceCSV(reference);
const target = structuredClone(reference);
for (const wire of target.wires) {
  for (const key of ['voltageMinV', 'voltageMaxV', 'rateBps']) delete wire.spec[key];
}
importInterfaces(target, csv);
const census = EXAMPLES.map(({ id, doc }) => {
  const { ready, blockingFindings, coverage } = reviewReadiness(doc);
  return { id, ready, blockingFindings, ...coverage };
});
const evidence = {
  date: '2026-10-13',
  startup: scenarios,
  csv: {
    header: csv.split('\n')[0],
    originalRateBps: reference.wires[0].spec.rateBps,
    reimportedRateBps: target.wires[0].spec.rateBps ?? null,
    scope: 'Legacy ICD CSV; board JSON and richer review-package exports are separate.',
  },
  examples: { count: census.length, ready: census.filter(row => row.ready).length, results: census },
};
writeFileSync(new URL('./source-probes.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ ...evidence, examples: { count: evidence.examples.count, ready: evidence.examples.ready } }, null, 2));
