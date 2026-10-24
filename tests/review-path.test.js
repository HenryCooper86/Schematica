import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLES } from '../src/examples.js';
import { deserialize } from '../src/serialize.js';
import { newDoc } from '../src/state.js';
import { reviewPath, STAGES } from '../src/review-path.js';
import { interfaceCompatibility } from '../src/interface-checks.js';

const seeded = () => deserialize(readFileSync(new URL('../docs/validation/study/seeded-review-board.schematica.json', import.meta.url), 'utf8')).doc;
const byId = (path, stage) => path.stages.find(s => s.id === stage);

test('an empty board starts at Prepare with the three building steps open', () => {
  const path = reviewPath(newDoc());
  assert.deepEqual(path.stages.map(s => s.id), STAGES);
  assert.equal(path.current, 'prepare');
  assert.deepEqual(byId(path, 'prepare').items.map(i => [i.id, i.done]), [['title', false], ['parts', false], ['wires', false]]);
  assert.equal(path.complete, false);
});

test('undeclared interfaces are Prepare items that land on the first missing field', () => {
  const doc = structuredClone(EXAMPLES.find(e => e.id === 'sensor-node-clean').doc);
  const path = reviewPath(doc);
  const declare = byId(path, 'prepare').items.filter(i => i.id.startsWith('declare:'));
  assert.ok(declare.length > 0);
  assert.equal(declare[0].target.type, 'interface');
  assert.equal(declare[0].target.wire, declare[0].id.slice('declare:'.length));
  assert.equal(declare[0].target.field, 'direction');
  assert.equal(path.current, 'prepare');
});

test('a declared board moves to Check until the current version has been checked', () => {
  const doc = structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
  let path = reviewPath(doc);
  assert.equal(byId(path, 'prepare').done, true);
  assert.equal(path.current, 'check');
  path = reviewPath(doc, { checked: path.mark });
  assert.equal(path.current, 'handoff');
  assert.equal(byId(path, 'resolve').items.length, 0);
  doc.wires[0].spec.rateBps = 1;
  const stale = reviewPath(doc, { checked: path.mark });
  assert.equal(stale.current, 'check', 'an edit invalidates the previous check');
  assert.equal(byId(stale, 'resolve').done, false, 'an unchecked version has not been resolved');
});

test('each seeded finding resolves to the exact Engineering field or record', () => {
  const doc = seeded();
  const path = reviewPath(doc, { checked: reviewPath(doc).mark });
  assert.equal(path.current, 'resolve');
  const targets = byId(path, 'resolve').items.map(i => i.target);
  assert.deepEqual(targets, [
    { type: 'interface', wire: 'w2', field: 'to_rateBps' },
    { type: 'interface', wire: 'w3', field: 'to_voltageMinV' },
    { type: 'interface', wire: 'w4', field: 'to_protocols' },
    { type: 'requirement', record: 'REQ-2' },
  ]);
  assert.ok(interfaceCompatibility(doc).every(f => f.level !== 'error' || f.field));
});

test('Handoff completes only after a revision and a package of the checked, ready version', () => {
  const doc = structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
  const { mark } = reviewPath(doc);
  let path = reviewPath(doc, { checked: mark, exported: mark });
  assert.equal(path.complete, false);
  assert.deepEqual(byId(path, 'handoff').items.map(i => i.done), [false, true]);
  path = reviewPath(doc, { checked: mark, exported: mark, revisions: [mark] });
  assert.equal(path.complete, true);
  const failing = seeded();
  const fm = reviewPath(failing).mark;
  assert.equal(byId(reviewPath(failing, { checked: fm, exported: fm, revisions: [fm] }), 'handoff').items[1].done, false, 'a package of a failing board is not a handoff');
});
