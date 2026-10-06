import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { interfaceChecklist } from '../src/interface-workbench.js';
import { impactAnalysis } from '../src/impact.js';
import { requirementFingerprint } from '../src/workflows.js';
import { Store, newDoc } from '../src/state.js';
import { groupSubsystem } from '../src/subsystems.js';
import { reviewHTML } from '../src/review.js';

const reference = () => structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);

test('guided declarations identify precise missing fields without modifying the board', () => {
  const doc = reference(), wire = doc.wires[0];
  wire.spec = undefined; wire.arrow = null;
  delete doc.nodes[0].interfacePorts;
  const before = structuredClone(doc);
  const fields = interfaceChecklist(doc, wire).map(s => s.field);
  assert.ok(fields.includes('direction'));
  assert.ok(fields.includes('voltageMinV'));
  assert.ok(fields.includes('from_protocols'));
  assert.ok(!fields.includes('to_direction'));
  assert.deepEqual(doc, before);
  wire.bus = 'power';
  assert.ok(!interfaceChecklist(doc, wire).some(s => /protocol|rateBps/.test(s.field)));
  wire.bus = 'flow';
  assert.deepEqual(interfaceChecklist(doc, wire), []);
});

test('complete declarations have no missing steps while zero voltage is a real value', () => {
  const doc = reference(), wire = doc.wires[0];
  assert.deepEqual(interfaceChecklist(doc, wire), []);
  wire.spec.voltageMinV = 0;
  delete wire.spec.voltageMaxV;
  assert.deepEqual(interfaceChecklist(doc, wire).map(s => s.field), ['voltageMaxV']);
});

test('impact review includes stale evidence and detects verification-method-only edits', () => {
  const before = reference();
  const record = { id: 'REQ-1', text: 'Reliable link', rationale: '', targets: [before.nodes[0].id],
    status: 'verified', evidence: 'bench-report.pdf', method: 'Bench test', owner: 'Reviewer' };
  record.verifiedFingerprint = requirementFingerprint(before, record);
  before.engineering = { requirements: [record] };
  const after = structuredClone(before);
  after.wires[0].spec.rateBps = 57600;
  let impact = impactAnalysis(before, after);
  assert.equal(impact.verification[0].id, 'REQ-1');
  assert.equal(impact.verification[0].needsReview, true);
  assert.equal(impact.verification[0].evidence, 'bench-report.pdf');
  assert.match(reviewHTML(after, before), /Verification evidence to review/);
  const methodOnly = structuredClone(before);
  methodOnly.engineering.requirements[0].method = 'Simulation';
  impact = impactAnalysis(before, methodOnly);
  assert.equal(impact.changed.length, 0);
  assert.equal(impact.requirements[0].reason, 'record-changed');
  assert.equal(impact.verification[0].needsReview, true);
});

test('impact evidence keeps repeated requirement IDs in separate subsystem scopes', () => {
  const root = newDoc('Two modules');
  for (const name of ['Left module', 'Right module']) {
    const doc = reference();
    const r = { id: 'REQ', text: 'Link', rationale: '', targets: [doc.nodes[0].id], status: 'verified', evidence: name, method: 'Test' };
    r.verifiedFingerprint = requirementFingerprint(doc, r); doc.engineering = { requirements: [r] };
    const store = new Store(doc); groupSubsystem(store, doc.nodes.map(n => n.id), name);
    root.nodes.push(store.doc.nodes[0]);
  }
  const after = structuredClone(root);
  after.nodes[0].subsystem.doc.wires[0].spec.rateBps = 57600;
  const rows = impactAnalysis(root, after).verification;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, JSON.stringify([root.nodes[0].id]));
  assert.equal(rows[0].evidence, 'Left module');
  assert.equal(rows[0].needsReview, true);
});
