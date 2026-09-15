import { applyEdits } from '../src/ai/ops.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire, updateItem } from '../src/state.js';
import { groupSubsystem } from '../src/subsystems.js';
import { checkDoc } from '../src/drc.js';
import { partCurrents } from '../src/power.js';

function connected() {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0), b = addNode(store, 'temp', 400, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  return { store, a, b };
}

test('subsystem interface requirements remain enforced from the root, including deeper children', () => {
  const { store, a, b } = connected();
  const inner = groupSubsystem(store, [a, b], 'Sensors');
  const outer = groupSubsystem(store, [inner], 'Control');
  const control = store.doc.nodes.find(n => n.id === outer).subsystem.doc;
  control.engineering = { interfacesRequired: true };
  const findings = checkDoc(store.doc).filter(f => f.rule === 'interface-incomplete');
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].ids, [outer]);
  store.doc.engineering = { interfacesRequired: true };
  assert.equal(checkDoc(store.doc).filter(f => f.rule === 'interface-incomplete').length, 1, 'inherited checks are not duplicated');
});

test('duty-weighted budgets include the higher sleep-state peak', () => {
  const node = { budget: { activeMa: 10, activePeakMa: 20, sleepMa: 1, sleepPeakMa: 80, dutyPercent: 25 } };
  const current = partCurrents(node, 'average');
  assert.equal(current.typicalMa, 3.25);
  assert.equal(current.peakMa, 80);
  assert.equal(partCurrents({ budget: {} }, 'average').peakMa, null, 'absent data must not become zero');
});

test('ordinary part replacements clear old ratings and undo restores them', () => {
  const { store, a } = connected();
  const node = store.doc.nodes.find(n => n.id === a);
  Object.assign(node, { sublabel: 'Part A', budget: { activeMa: 20 }, interfacePorts: { i2c: { rateBps: 400000 } }, fields: { ityp: '20mA' }, notes: 'System context' });
  const original = structuredClone(store.doc);
  updateItem(store, a, { sublabel: 'Part B' });
  const replacement = store.doc.nodes.find(n => n.id === a);
  assert.equal(replacement.budget, undefined);
  assert.equal(replacement.interfacePorts, undefined);
  assert.equal(replacement.fields, undefined);
  assert.equal(replacement.notes, 'System context');
  store.undo();
  assert.deepEqual(store.doc, original);
});

test('unchanged part numbers retain ratings, and explicit replacement data is accepted', () => {
  const { store, a } = connected();
  const node = store.doc.nodes.find(n => n.id === a);
  node.sublabel = 'Part A'; node.budget = { activeMa: 20 };
  updateItem(store, a, { sublabel: 'Part A' });
  assert.equal(store.doc.nodes[0].budget.activeMa, 20);
  updateItem(store, a, { sublabel: 'Part B', budget: { activeMa: 8 }, fields: { ityp: '8mA' } });
  assert.equal(store.doc.nodes[0].budget.activeMa, 8);
  assert.equal(store.doc.nodes[0].fields.ityp, '8mA');
});


test('tool edits clear replaced-part declarations without merging old current fields', () => {
  const { store, a } = connected();
  Object.assign(store.doc.nodes[0], { sublabel: 'Part A', budget: { activeMa: 20 }, interfacePorts: { i2c: { rateBps: 400000 } }, fields: { ityp: '20mA', ipeak: '40mA' } });
  const result = applyEdits(store.doc, [{ op: 'update_part', id: a, sublabel: 'Part B', fields: { ityp: '8mA' } }]);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(store.doc.nodes[0].fields, { ityp: '8mA' });
  assert.equal(store.doc.nodes[0].budget, undefined);
  assert.equal(store.doc.nodes[0].interfacePorts, undefined);
});

test('failed tool batches do not clear ratings, and kind replacement resets endpoint data', () => {
  const { store, a } = connected();
  Object.assign(store.doc.nodes[0], { sublabel: 'Part A', budget: { activeMa: 20 }, interfacePorts: { i2c: { rateBps: 400000 } } });
  const before = structuredClone(store.doc);
  const failed = applyEdits(store.doc, [{ op: 'update_part', id: a, sublabel: 'Part B' }, { op: 'update_part', id: 'missing', sublabel: 'X' }]);
  assert.equal(failed.ok, false);
  assert.deepEqual(store.doc, before);
  assert.equal(applyEdits(store.doc, [{ op: 'replace_part', id: a, kind: 'sbc' }]).ok, true);
  assert.equal(store.doc.nodes[0].budget, undefined);
  assert.equal(store.doc.nodes[0].interfacePorts, undefined);
});
