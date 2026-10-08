import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringChecks } from '../src/engineering.js';
import { checkDoc } from '../src/drc.js';
import { TEACHING_EXAMPLES } from '../src/examples-teaching.js';
import { REFERENCE_EXAMPLE } from '../src/examples-reference.js';
import { validationCoverage, reviewReadiness } from '../src/validation-coverage.js';
import { Store } from '../src/state.js';
import { groupSubsystem } from '../src/subsystems.js';
import { setLang } from '../src/i18n.js';

const signalReference = () => structuredClone(REFERENCE_EXAMPLE.doc);
const incomplete = doc => engineeringChecks(doc).filter(f => f.rule === 'interface-incomplete');

test('required power and ground interfaces remain ready with voltage, direction and sources', () => {
  const doc = structuredClone(TEACHING_EXAMPLES[0].doc);
  doc.engineering = { interfacesRequired: true };
  assert.equal(validationCoverage(doc).checked, 8);
  assert.deepEqual(incomplete(doc), []);
  assert.equal(reviewReadiness(doc).ready, true);
});

test('required signal interfaces accept numeric limits without duplicated display text', () => {
  const doc = signalReference();
  doc.engineering = { interfacesRequired: true };
  for (const wire of doc.wires) {
    delete wire.spec.voltage;
    delete wire.spec.rate;
    delete wire.spec.direction;
  }
  assert.equal(validationCoverage(doc).checked, 4);
  assert.deepEqual(incomplete(doc), []);
  assert.equal(reviewReadiness(doc).ready, true);
});

test('required interface policies exclude flow and relationship links', () => {
  const doc = signalReference();
  doc.wires.forEach((wire, i) => {
    wire.bus = i % 2 ? 'link' : 'flow';
    delete wire.spec;
    wire.interfacesRequired = true;
  });
  doc.nodes.forEach(node => { delete node.interfacePorts; });
  assert.equal(validationCoverage(doc).excluded, 4);
  assert.deepEqual(incomplete(doc), [], 'wire-specific policies also exclude relationship connections');
  doc.engineering = { interfacesRequired: true };
  assert.deepEqual(incomplete(doc), []);
});

test('required interfaces report missing endpoint declarations despite complete connection text', () => {
  const doc = signalReference();
  doc.engineering = { interfacesRequired: true };
  delete doc.nodes[1].interfacePorts.left;
  const findings = incomplete(doc);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'warning');
  assert.deepEqual(findings[0].ids, ['w1']);
  assert.match(findings[0].message, /endpoint 2 declarations/);
  assert.equal(validationCoverage(doc).unassessed, 1);
});

test('required interfaces report absent numeric limits despite complete connection text', () => {
  const doc = signalReference();
  doc.engineering = { interfacesRequired: true };
  delete doc.wires[0].spec.voltageMaxV;
  delete doc.wires[1].spec.rateBps;
  const findings = incomplete(doc);
  assert.deepEqual(findings.map(f => f.ids), [['w1'], ['w2']]);
  for (const finding of findings) assert.match(finding.message, /connection limits and source/);
  assert.equal(validationCoverage(doc).unassessed, 2);
});

test('inherited required policies check nested endpoint declarations once with scoped selection IDs', () => {
  const store = new Store(signalReference());
  const inner = groupSubsystem(store, ['n1', 'n2'], 'Serial pair');
  const outer = groupSubsystem(store, [inner], 'Control');
  const control = store.doc.nodes.find(node => node.id === outer).subsystem.doc;
  control.engineering = { interfacesRequired: true };
  assert.deepEqual(checkDoc(store.doc).filter(f => f.rule === 'interface-incomplete'), []);
  const child = control.nodes.find(node => node.id === inner).subsystem.doc;
  child.nodes.find(node => node.id === 'n2').interfacePorts.left.source = '';
  const findings = checkDoc(store.doc).filter(f => f.rule === 'interface-incomplete');
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].ids, [outer]);
  assert.deepEqual(findings[0].analysisIds, [JSON.stringify([outer, inner, 'w1'])]);
  store.doc.engineering = { interfacesRequired: true };
  assert.equal(checkDoc(store.doc).filter(f => f.rule === 'interface-incomplete').length, 1);
});

test('required interface findings keep translated missing-declaration details', () => {
  const doc = signalReference();
  doc.engineering = { interfacesRequired: true };
  doc.nodes[1].interfacePorts.left.source = '';
  setLang('zh');
  try {
    const findings = incomplete(doc);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /接口 w1 缺少/);
    assert.match(findings[0].message, /端点 2 的声明/);
  } finally { setLang('en'); }
});
