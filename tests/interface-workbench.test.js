import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { reuseInterfaceFields } from '../src/interface-workbench.js';
import { validationCoverage } from '../src/validation-coverage.js';

const reference = () => structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);

test('reuse copies only missing connection declarations on explicitly selected same-bus targets', () => {
  const doc = reference();
  const [source, target] = doc.wires;
  target.spec = { source: 'Target-specific evidence', voltageMinV: 3.2 };
  const sourceBefore = structuredClone(source.spec);
  const changes = reuseInterfaceFields(doc, source.id, [target.id]);
  assert.deepEqual(changes.map(c => c.id), [target.id]);
  assert.ok(changes[0].fields.includes('protocol'));
  assert.equal(target.spec.source, 'Target-specific evidence');
  assert.equal(target.spec.voltageMinV, 3.2);
  assert.equal(target.spec.protocol, source.spec.protocol);
  assert.deepEqual(source.spec, sourceBefore);
});

test('reuse rejects cross-bus and newly incompatible declarations atomically', () => {
  const doc = reference();
  const source = doc.wires[0];
  const target = doc.wires[1];
  target.bus = 'i2c';
  const before = structuredClone(doc);
  assert.throws(() => reuseInterfaceFields(doc, source.id, [target.id]), /same bus/i);
  assert.deepEqual(doc, before);

  target.bus = source.bus;
  const sameBus = target;
  assert.ok(sameBus, 'reference has a repeated bus');
  sameBus.spec = { voltageMinV: 99, voltageMaxV: 100 };
  const incompatibleBefore = structuredClone(doc);
  assert.throws(() => reuseInterfaceFields(doc, source.id, [doc.wires[2].id, sameBus.id]), /incompatible/i);
  assert.deepEqual(doc, incompatibleBefore);
});

test('reuse leaves endpoint capabilities alone and cannot claim readiness by copying a wire', () => {
  const doc = reference();
  const [source, target] = doc.wires.filter(w => w.bus === doc.wires[0].bus);
  target.spec = undefined;
  delete doc.nodes.find(n => n.id === target.to.node).interfacePorts;
  const beforePorts = doc.nodes.map(n => structuredClone(n.interfacePorts));
  reuseInterfaceFields(doc, source.id, [target.id]);
  assert.deepEqual(doc.nodes.map(n => n.interfacePorts), beforePorts);
  assert.ok(validationCoverage(doc).unassessed > 0);
});
