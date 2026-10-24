import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire } from '../src/state.js';
import { impactAnalysis } from '../src/impact.js';
import { requirementFingerprint, verificationRows } from '../src/workflows.js';
import { COSMETIC_FIELDS, canonical, equal } from '../src/compare.js';

function board() {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0), b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  return { store, a, b, w };
}

test('impact and verification agree that a label rename changes nothing', () => {
  const { store, b } = board();
  const r = { id: 'REQ', text: 'Read', rationale: '', targets: [b], status: 'verified', method: 'Bench', evidence: 'report' };
  r.verifiedFingerprint = requirementFingerprint(store.doc, r);
  store.doc.engineering = { requirements: [r] };
  const before = structuredClone(store.doc);
  store.doc.nodes.find((n) => n.id === b).label = 'Renamed';
  const impact = impactAnalysis(before, store.doc);
  assert.equal(impact.changed.length, 0);
  assert.equal(impact.verification.length, 0, 'nothing to review');
  assert.equal(verificationRows(store.doc, before)[0].changed, false);
});

test('a wire onto a part the board no longer has does not put an empty item in the affected list', () => {
  const { store, a, b } = board();
  const before = structuredClone(store.doc);
  store.doc.nodes = store.doc.nodes.filter((n) => n.id !== b);
  const impact = impactAnalysis(before, store.doc);
  assert.ok(impact.affected.every((item) => item.id && item.collection), JSON.stringify(impact.affected));
  assert.ok(impact.affected.some((item) => item.id === a));
});

test('one cosmetic field set and one canonical form are shared', () => {
  assert.deepEqual([...COSMETIC_FIELDS].sort(), ['color', 'h', 'label', 'view', 'w', 'x', 'y']);
  assert.ok(equal({ a: 1, b: [{ c: 2, d: 3 }] }, { b: [{ d: 3, c: 2 }], a: 1 }));
  assert.deepEqual(canonical({ b: { y: 1, x: 2 }, a: 0 }, new Set(['x'])), { a: 0, b: { y: 1 } });
});
