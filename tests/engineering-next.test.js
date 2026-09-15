import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';
import { interfaceCompatibility } from '../src/interface-checks.js';
import { interfaceCSV, importInterfaces } from '../src/engineering.js';
import { impactAnalysis, proposePartChange } from '../src/impact.js';
import { reviewPackage, reviewHTML } from '../src/review.js';
import { groupSubsystem } from '../src/subsystems.js';
function fixture() {
  const s = new Store();
  const a = addNode(s, 'mcu', 0, 0),
    b = addNode(s, 'temp', 300, 0),
    w = addWire(s, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  return { s, a, b, w };
}
const cap = () => ({
  direction: 'bidirectional',
  voltageMinV: 3,
  voltageMaxV: 3.6,
  rateBps: 400000,
  protocols: ['I2C v7'],
  source: 'datasheet',
});
function declared() {
  const f = fixture();
  f.s.doc.nodes.forEach((n) => (n.interfacePorts = { i2c: cap() }));
  f.s.doc.wires[0].spec = {
    direction: 'bidirectional',
    voltageMinV: 3.1,
    voltageMaxV: 3.5,
    rateBps: 400000,
    protocol: 'I2C v7',
    source: 'ICD',
  };
  return f;
}
test('complete compatible declarations pass; unknown data is not an error', () => {
  const { s } = declared();
  assert.deepEqual(interfaceCompatibility(s.doc), []);
  delete s.doc.nodes[1].interfacePorts;
  assert.deepEqual(
    interfaceCompatibility(s.doc).map((f) => f.level),
    ['info'],
  );
  delete s.doc.nodes[0].interfacePorts;
  delete s.doc.wires[0].spec;
  assert.deepEqual(interfaceCompatibility(s.doc), []);
});
test('voltage, bandwidth, protocol and direction conflicts are explicit errors', () => {
  const { s } = declared();
  s.doc.nodes[1].interfacePorts.i2c = {
    ...cap(),
    direction: 'input',
    voltageMaxV: 3.2,
    rateBps: 100000,
    protocols: ['SPI'],
  };
  const rules = new Set(
    interfaceCompatibility(s.doc)
      .filter((f) => f.level === 'error')
      .map((f) => f.rule),
  );
  for (const r of [
    'interface-voltage',
    'interface-bandwidth',
    'interface-protocol',
    'interface-direction',
  ])
    assert.ok(rules.has(r));
});
test('partial ranges and invalid bandwidth never silently pass', () => {
  const { s } = declared();
  delete s.doc.nodes[0].interfacePorts.i2c.voltageMaxV;
  assert.ok(interfaceCompatibility(s.doc).some((f) => f.rule === 'interface-unknown'));
  s.doc.nodes[0].interfacePorts.i2c.voltageMaxV = 2;
  assert.ok(interfaceCompatibility(s.doc).some((f) => f.rule === 'interface-invalid'));
  s.doc.nodes[0].interfacePorts.i2c = cap();
  s.doc.wires[0].spec.rateBps = 0;
  assert.ok(interfaceCompatibility(s.doc).some((f) => f.rule === 'interface-invalid'));
  s.doc.wires[0].spec.rateBps = -1;
  assert.ok(interfaceCompatibility(s.doc).some((f) => f.rule === 'interface-invalid'));
});
test('structured declarations survive serialization and legacy CSV updates', () => {
  const { s } = declared();
  const doc = deserialize(serialize(s.doc)).doc;
  assert.deepEqual(doc.nodes[0].interfacePorts, s.doc.nodes[0].interfacePorts);
  const old = doc.wires[0].spec.rateBps;
  importInterfaces(doc, interfaceCSV(doc));
  assert.equal(doc.wires[0].spec.rateBps, old);
  assert.deepEqual(interfaceCompatibility(doc), []);
});
test('impact excludes layout and includes connected allocations and removals', () => {
  const { s, a, b, w } = fixture();
  s.doc.engineering = {
    requirements: [
      {
        id: 'REQ',
        text: 'Read sensor',
        targets: [b],
        status: 'verified',
        evidence: 'test',
        owner: 'E',
      },
    ],
    decisions: [{ id: 'ADR', text: 'Use I2C', targets: [w], status: 'accepted' }],
  };
  const before = structuredClone(s.doc);
  s.doc.nodes[0].x += 50;
  assert.equal(impactAnalysis(before, s.doc).changed.length, 0);
  s.doc.nodes[0].rail = '5V';
  const impact = impactAnalysis(before, s.doc);
  assert.ok(impact.affected.some((i) => i.id === b));
  assert.equal(impact.requirements[0].id, 'REQ');
  assert.equal(impact.decisions[0].id, 'ADR');
  s.doc.nodes = s.doc.nodes.filter((n) => n.id !== a);
  assert.ok(impactAnalysis(before, s.doc).changed.some((c) => c.id === a && c.type === 'removed'));
});
test('replacement previews clear stale ratings without mutating the board', () => {
  const { s, a } = declared();
  s.doc.nodes[0].budget = { activeMa: 100 };
  const initial = serialize(s.doc);
  const proposal = proposePartChange(s.doc, { id: a, partNumber: 'New MCU', rail: '5V' });
  assert.equal(serialize(s.doc), initial);
  assert.equal(proposal.nodes[0].budget, undefined);
  assert.equal(proposal.nodes[0].interfacePorts, undefined);
  s.doc.nodes[0].locked = true;
  assert.throws(() => proposePartChange(s.doc, { id: a, partNumber: 'X', rail: '3V' }));
});
test('global operating-mode changes include allocated parts in impact', () => {
  const { s } = fixture();
  const before = structuredClone(s.doc);
  s.doc.engineering = { budget: { mode: 'sleep' } };
  assert.equal(
    impactAnalysis(before, s.doc).changed.filter((c) => c.collection === 'nodes').length,
    2,
  );
});
test('nested review tables retain repeated local IDs, allocations and internal interfaces', () => {
  const { s, a, b } = declared();
  s.doc.engineering = {
    requirements: [
      { id: 'REQ', text: 'Read', targets: [a], status: 'verified', evidence: 'report', owner: 'E' },
    ],
  };
  groupSubsystem(s, [a, b], 'Sensors');
  const report = reviewPackage(s.doc);
  assert.equal(report.version, 2);
  assert.equal(report.interfaces.length, 1);
  assert.notEqual(report.interfaces[0].scope, '[]');
  assert.equal(report.scopes.length, 2);
  assert.equal(report.coverage.total, 2);
  assert.equal(report.coverage.allocated, 2);
  const html = reviewHTML(s.doc);
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('interfaces-all.csv'));
  assert.ok(!html.includes('<pre>'));
  assert.ok(html.includes('schematica-review-focus'));
  const before = structuredClone(s.doc);
  s.doc.nodes[0].subsystem.doc.nodes[0].rail = '5V';
  assert.ok(impactAnalysis(before, s.doc).changed.some((c) => c.scope !== '[]'));
});

test('bipolar and negative operating voltage ranges are valid declarations', () => {
  const { s } = declared();
  for (const n of s.doc.nodes)
    Object.assign(n.interfacePorts.i2c, { voltageMinV: -5, voltageMaxV: 5 });
  Object.assign(s.doc.wires[0].spec, { voltageMinV: -3, voltageMaxV: 3 });
  assert.deepEqual(interfaceCompatibility(s.doc), []);
  const doc = deserialize(serialize(s.doc)).doc;
  assert.equal(doc.nodes[0].interfacePorts.i2c.voltageMinV, -5);
});
