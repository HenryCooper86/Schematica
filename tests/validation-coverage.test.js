import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { validationCoverage, reviewReadiness, coverageSummary } from '../src/validation-coverage.js';
import { checkDoc } from '../src/drc.js';
import { reviewHTML, reviewPackage } from '../src/review.js';
import { groupSubsystem } from '../src/subsystems.js';
import { Store, newDoc } from '../src/state.js';
import { setLang } from '../src/i18n.js';

const reference = () => structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
test('clean conceptual examples expose undeclared interfaces without changing ordinary findings', () => {
  for (const [id, applicable, excluded] of [['rdk-x3-usb-vision',4,2],['rdk-x5-inspection',4,4]]) {
    const doc = EXAMPLES.find(e => e.id === id).doc;
    assert.deepEqual(checkDoc(doc), []);
    const c = validationCoverage(doc);
    assert.equal(c.checked, 0);
    assert.equal(c.unassessed, applicable);
    assert.equal(c.excluded, excluded);
    assert.equal(reviewReadiness(doc).ready, false);
  }
});
test('declarations move from checked to failed or unassessed; removing a source cannot improve readiness', () => {
  const doc = reference();
  assert.equal(reviewReadiness(doc).ready, true);
  assert.equal(validationCoverage(doc).checked, 4);
  doc.nodes[1].interfacePorts.left.rateBps = 9600;
  let c = validationCoverage(doc);
  assert.equal(c.failed, 1); assert.equal(c.checked, 3);
  assert.equal(reviewReadiness(doc).ready, false);
  delete doc.nodes[1].interfacePorts.left;
  c = validationCoverage(doc);
  assert.equal(c.failed, 0); assert.equal(c.unassessed, 1);
  doc.nodes[1].interfacePorts.left = structuredClone(doc.nodes[0].interfacePorts.right);
  doc.wires[0].spec.source = '   ';
  assert.equal(validationCoverage(doc).unassessed, 1);
  doc.wires[0].spec.voltageMinV = 9;
  assert.equal(validationCoverage(doc).failed, 1, 'invalid ranges are failures even with missing metadata');
});
test('empty and relationship-only diagrams never claim interface review readiness', () => {
  assert.equal(reviewReadiness(newDoc()).ready, false);
  const doc = reference();
  doc.wires.forEach(w => { w.bus = 'flow'; delete w.spec; });
  doc.nodes.forEach(n => { delete n.interfacePorts; });
  assert.equal(validationCoverage(doc).excluded, 4);
  assert.equal(reviewReadiness(doc).ready, false);
});
test('power and ground require voltage, direction and sources without invented bit rates', () => {
  const doc = reference();
  doc.wires = [doc.wires[0]];
  doc.wires[0].bus = 'power';
  delete doc.wires[0].spec.rateBps; delete doc.wires[0].spec.protocol;
  doc.nodes.forEach(n => Object.values(n.interfacePorts).forEach(c => { delete c.rateBps; delete c.protocols; }));
  assert.equal(validationCoverage(doc).checked, 1);
  doc.wires[0].bus = 'gnd';
  assert.equal(validationCoverage(doc).checked, 1);
  delete doc.wires[0].spec.voltageMaxV;
  assert.equal(validationCoverage(doc).unassessed, 1);
});
test('nested connections count once and selection maps to their visible subsystem', () => {
  const store = new Store(reference());
  const id = groupSubsystem(store, ['n1','n2'], 'Serial pair');
  let c = validationCoverage(store.doc);
  assert.equal(c.total, 4); assert.equal(c.checked, 4);
  const child = store.doc.nodes.find(n => n.id === id).subsystem.doc;
  child.wires[0].spec.source = '';
  c = validationCoverage(store.doc);
  assert.equal(c.unassessed, 1);
  assert.deepEqual(c.connections.find(w => w.status === 'unassessed').ids, [id]);
  assert.equal(reviewReadiness(store.doc).ready, false);
});
test('review JSON and HTML retain coverage and escape author-controlled labels', () => {
  const doc = reference();
  doc.wires[0].label = '<img src=x onerror=alert(1)>';
  delete doc.wires[0].spec;
  const report = reviewPackage(doc);
  assert.equal(report.interfaceReadiness.ready, false);
  assert.equal(report.interfaceReadiness.coverage.unassessed, 1);
  const html = reviewHTML(doc);
  assert.match(html, /Interface validation coverage/);
  assert.match(html, /Not ready for interface review/);
  assert.match(html, /3 checked · 0 failed · 1 unassessed/);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
});
test('coverage summaries translate without changing status counts', () => {
  const c = validationCoverage(reference());
  setLang('zh');
  try { assert.match(coverageSummary(c), /4 条已检查/); }
  finally { setLang('en'); }
});
