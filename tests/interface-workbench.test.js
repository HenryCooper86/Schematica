import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { reuseInterfaceFields } from '../src/interface-workbench.js';
import { validationCoverage } from '../src/validation-coverage.js';
import { interfaceRows, interfaceCSV, importInterfaces } from '../src/engineering.js';

const reference = () => structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);

test('reuse preserves a target direction declared by its arrow', () => {
  for (const [arrow, direction] of [['fwd', 'from-to'], ['back', 'to-from'], ['both', 'bidirectional']]) {
    const doc = reference();
    const [source, target] = doc.wires;
    source.spec.direction = arrow === 'both' ? 'from-to' : 'bidirectional';
    target.spec = { source: 'Target evidence' };
    target.arrow = arrow;
    const changes = reuseInterfaceFields(doc, source.id, [target.id]);
    assert.equal(target.arrow, arrow);
    assert.equal(interfaceRows(doc).find(row => row.id === target.id).direction, direction);
    assert.ok(!changes[0].fields.includes('direction'));
    assert.equal(target.spec.source, 'Target evidence');
  }
});

test('reuse accepts an arrow-only source direction for an undirected target', () => {
  const doc = reference();
  const [source, target] = doc.wires;
  delete source.spec.direction;
  source.arrow = 'back';
  target.spec = undefined;
  target.arrow = null;
  const changes = reuseInterfaceFields(doc, source.id, [target.id]);
  assert.ok(changes[0].fields.includes('direction'));
  assert.equal(target.spec.direction, 'to-from');
  assert.equal(target.arrow, 'back');
});

test('ICD export and reimport retain arrow directions alongside partial specifications', () => {
  const doc = reference();
  const wire = doc.wires[0];
  wire.spec = { source: 'Partial declaration' };
  wire.arrow = 'back';
  assert.equal(interfaceRows(doc).find(row => row.id === wire.id).direction, 'to-from');
  importInterfaces(doc, interfaceCSV(doc));
  assert.equal(wire.arrow, 'back');
  assert.equal(wire.spec.direction, 'to-from');
});

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
