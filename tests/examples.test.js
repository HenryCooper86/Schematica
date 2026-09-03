import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { serialize, deserialize } from '../src/serialize.js';
import { getPart } from '../src/palette.js';
import { nodeRect } from '../src/geometry.js';

test('there are at least three examples with unique ids and names', () => {
  assert.ok(EXAMPLES.length >= 3);
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, EXAMPLES.length);
  assert.equal(new Set(EXAMPLES.map((e) => e.name)).size, EXAMPLES.length);
});

test('every example round-trips through deserialize with zero warnings', () => {
  for (const ex of EXAMPLES) {
    const { doc, warnings } = deserialize(serialize(ex.doc));
    assert.deepEqual(warnings, [], `${ex.id}: ${warnings.join(' | ')}`);
    assert.deepEqual(doc, ex.doc, `${ex.id} round trip`);
  }
});

test('every example is substantial and presentable', () => {
  for (const ex of EXAMPLES) {
    assert.ok(ex.doc.nodes.length >= 5, `${ex.id} nodes`);
    assert.ok(ex.doc.wires.length >= 4, `${ex.id} wires`);
    assert.ok(ex.doc.zones.length >= 1, `${ex.id} zones`);
    assert.ok(ex.doc.journey.length >= 3, `${ex.id} journey`);
    for (const s of ex.doc.journey) {
      assert.ok(s.caption.length > 0, `${ex.id} step captions must not be empty`);
    }
  }
});

test('every example wire bus matches at least one endpoint port bus', () => {
  for (const ex of EXAMPLES) {
    for (const w of ex.doc.wires) {
      const busOf = (ref) => getPart(ex.doc.nodes.find((n) => n.id === ref.node).kind)
        .ports.find((p) => p.id === ref.port)?.bus;
      assert.ok(
        [busOf(w.from), busOf(w.to)].includes(w.bus),
        `${ex.id} ${w.id}: bus "${w.bus}" matches neither endpoint`,
      );
    }
  }
});

test('every zone fully contains at least one node', () => {
  for (const ex of EXAMPLES) {
    for (const z of ex.doc.zones) {
      const inside = ex.doc.nodes.map(nodeRect).some((n) => n.x >= z.x && n.y >= z.y
        && n.x + n.w <= z.x + z.w && n.y + n.h <= z.y + z.h);
      assert.ok(inside, `${ex.id} zone "${z.label}" contains no node`);
    }
  }
});
