import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, localizedExample } from '../src/examples.js';
import { reviewReadiness } from '../src/validation-coverage.js';
import { checkDoc } from '../src/drc.js';
import { serialize, deserialize } from '../src/serialize.js';

for (const bus of ['power', 'i2c', 'can']) {
  test(`${bus} teaching reference is explicitly illustrative, complete, and round trips in both languages`, () => {
    const example = EXAMPLES.find(e => e.id === `declared-${bus}-reference`);
    assert.ok(example, 'teaching reference exists');
    for (const lang of ['en', 'zh']) {
      const doc = localizedExample(example, lang).doc;
      assert.equal(reviewReadiness(doc).ready, true, JSON.stringify(checkDoc(doc)));
      const loaded = deserialize(serialize(doc));
      assert.deepEqual(loaded.warnings, []);
      assert.deepEqual(loaded.doc, doc);
      for (const wire of doc.wires) {
        assert.match(wire.spec.source, /Illustrative/);
        assert.match(wire.spec.source, /assumptions/);
      }
    }
  });
  test(`${bus} teaching reference exposes a genuine declared limit conflict`, () => {
    const example = EXAMPLES.find(e => e.id === `declared-${bus}-reference`);
    assert.ok(example);
    const doc = structuredClone(example.doc), wire = doc.wires[0];
    const target = doc.nodes.find(n => n.id === wire.to.node).interfacePorts[wire.to.port];
    if (bus === 'power') target.voltageMaxV = 1;
    else target.rateBps = 1;
    assert.equal(reviewReadiness(doc).ready, false);
    assert.ok(checkDoc(doc).some(f => f.rule === (bus === 'power' ? 'interface-invalid' : 'interface-bandwidth')));
  });
}
