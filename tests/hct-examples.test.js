import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, localizedExample } from '../src/examples.js';
import { checkLayout } from '../src/layout-checks.js';
import { reviewReadiness } from '../src/validation-coverage.js';
import { serialize, deserialize } from '../src/serialize.js';

const boards = EXAMPLES.filter(ex => ex.id.startsWith('hct-'));
const board = id => boards.find(ex => ex.id === id).doc;
function reaches(doc, from, target) {
  const seen = new Set(), pending = [from];
  while (pending.length) {
    const id = pending.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...doc.wires.filter(w => w.from.node === id).map(w => w.to.node));
  }
  return false;
}

test('HCT integration studies preserve bilingual files, stories and clear layouts', () => {
  assert.equal(boards.length, 3);
  for (const ex of boards) for (const lang of ['en', 'zh']) {
    const {doc} = localizedExample(ex, lang);
    const loaded = deserialize(serialize(doc));
    assert.deepEqual(loaded.warnings, []);
    assert.deepEqual(loaded.doc, doc);
    assert.deepEqual(checkLayout(doc), [], `${ex.id}/${lang}`);
    assert.equal(reviewReadiness(doc).ready, false, 'functional flows do not prove electrical readiness');
    for (const step of doc.journey) {
      assert.ok(step.stops.length >= 3);
      for (const stop of step.stops) {
        assert.ok(doc.nodes.some(n => n.id === stop.node));
        if (lang === 'zh') assert.match(stop.caption, /[一-鿿]/);
      }
    }
  }
});

test('Astra perception includes radar and rejects unavailable parking before motion authority', () => {
  const doc = board('hct-astra-degraded');
  for (const sensor of ['front', 'surround', 'park', 'radar']) assert.ok(reaches(doc, sensor, 'astra'));
  assert.ok(reaches(doc, 'astra', 'vehicle'));
  assert.ok(reaches(doc, 'health', 'record'));
  assert.equal(reaches(doc, 'degrade', 'vehicle'), false);
});

test('Luna invalid requests cannot reach brakes while valid requests have independent feedback', () => {
  const doc = board('hct-luna-arbitration');
  assert.ok(reaches(doc, 'luna', 'brake'));
  assert.equal(reaches(doc, 'reject', 'brake'), false);
  assert.ok(reaches(doc, 'brake', 'observer'));
  assert.ok(reaches(doc, 'arbitrate', 'observer'));
  assert.ok(reaches(doc, 'reject', 'observer'));
});

test('migration bench compares both targets and sends failures through a repeatable regression loop', () => {
  const doc = board('hct-luna-regression');
  for (const target of ['luna3', 'luna6']) {
    assert.ok(reaches(doc, 'corpus', target));
    assert.ok(reaches(doc, 'faults', target));
    assert.ok(reaches(doc, target, 'observer'));
  }
  assert.ok(reaches(doc, 'triage', 'faults'));
  assert.ok(reaches(doc, 'approve', 'evidence'));
  assert.ok(reaches(doc, 'triage', 'evidence'));
  assert.equal(doc.wires.some(w => w.from.node === 'triage' && w.to.node === 'approve'), false);
});
