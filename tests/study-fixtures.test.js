import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serialize, deserialize } from '../src/serialize.js';
import { checkDoc } from '../src/drc.js';
import { SEEDED_FINDINGS } from './e2e/study.mjs';

const read = (name) => deserialize(readFileSync(new URL(`../docs/validation/study/${name}`, import.meta.url), 'utf8'));

// The adoption study's seeded board must keep exactly its four planted
// issues, and the repaired reference none, or the answer key and the
// facilitator script drift from what participants see.
test('the seeded study board carries exactly the four seeded findings the answer key lists', () => {
  const { doc, warnings } = read('seeded-review-board.schematica.json');
  assert.deepEqual(warnings, []);
  const findings = checkDoc(doc);
  assert.deepEqual(findings.map((f) => f.message), SEEDED_FINDINGS);
  assert.deepEqual(findings.map((f) => f.level), ['error', 'error', 'error', 'warning']);
  assert.deepEqual(findings.map((f) => f.rule), ['interface-bandwidth', 'interface-voltage', 'interface-protocol', 'requirement-evidence']);
  assert.equal(doc.engineering.interfacesRequired, true, 'incomplete declarations would be reported too');
  assert.deepEqual(doc.engineering.requirements.map((r) => r.id), ['REQ-1', 'REQ-2', 'REQ-3']);
  assert.deepEqual(deserialize(serialize(doc)).doc, doc, 'round-trips unchanged');
});

test('the repaired reference board is clean and differs from the seeded board only in the four repairs', () => {
  const seeded = read('seeded-review-board.schematica.json').doc;
  const { doc, warnings } = read('repaired-reference-board.schematica.json');
  assert.deepEqual(warnings, []);
  assert.deepEqual(checkDoc(doc), []);
  const port = (d, id) => d.nodes.find((n) => n.id === id).interfacePorts.left;
  assert.equal(port(seeded, 'n3').rateBps, 9600);
  assert.equal(port(doc, 'n3').rateBps, 115200);
  assert.deepEqual([port(seeded, 'n4').voltageMinV, port(seeded, 'n4').voltageMaxV], [1.7, 1.9]);
  assert.deepEqual([port(doc, 'n4').voltageMinV, port(doc, 'n4').voltageMaxV], [3, 3.6]);
  assert.deepEqual(port(seeded, 'n5').protocols, ['UART v2 framed']);
  assert.deepEqual(port(doc, 'n5').protocols, ['UART']);
  const req2 = (d) => d.engineering.requirements.find((r) => r.id === 'REQ-2');
  assert.equal(req2(seeded).evidence, '');
  assert.equal(req2(seeded).method, undefined, 'the participant must supply a method as well as evidence');
  assert.ok(req2(doc).evidence && req2(doc).method);
  assert.equal(seeded.nodes.length, doc.nodes.length);
  assert.equal(seeded.wires.length, doc.wires.length);
});
