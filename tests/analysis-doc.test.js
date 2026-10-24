import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisDoc } from '../src/analysis-doc.js';
import { Store, addNode, addWire } from '../src/state.js';
import { groupSubsystem } from '../src/subsystems.js';

test('a nested requirement or decision without targets is carried up rather than thrown on', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0), b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const id = groupSubsystem(store, [a, b], 'Sensing');
  const child = store.doc.nodes.find((n) => n.id === id).subsystem.doc;
  child.engineering = { requirements: [{ id: 'REQ', text: 'Read', rationale: '' }], decisions: [{ id: 'ADR', text: 'I2C' }] };
  const out = analysisDoc(store.doc);
  assert.deepEqual(out.engineering.requirements.map((r) => r.targets), [[]]);
  assert.deepEqual(out.engineering.decisions.map((r) => r.targets), [[]]);
});
