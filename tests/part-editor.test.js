import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/palette.js';
import { initials, optionList, normalizePart, definitionFrom } from '../src/custom.js';
import { nodePart } from '../src/rdk/profiles.js';

// The editor's draft conversion lives inside initPartEditor, which needs a
// document to build. The two pure functions are lifted out of the module
// source and run against their real dependencies, so this exercises the
// shipped code rather than a copy of it.
const SRC = readFileSync(new URL('../src/ui/part-editor.js', import.meta.url), 'utf8');
const lift = (re) => SRC.match(re)[0];

function draftPair() {
  const make = new Function('CATEGORIES', 'initials', 'optionList', `
    let nextPort = 0, nextField = 0, draft = null;
    ${lift(/  function toDraft\(def\) \{[\s\S]*?\n  \}/)}
    ${lift(/  function rawDraft\(\) \{[\s\S]*?\n  \}/)}
    return { toDraft, rawDraft, load: (d) => { draft = d; }, edit: (fn) => fn(draft) };
  `);
  return make(CATEGORIES, initials, optionList);
}

test('a field placeholder survives the editor draft round trip', () => {
  const pe = draftPair();
  const def = {
    name: 'Stage', category: 'robotics', accent: null, icon: { kind: 'mcu' }, ports: [],
    fields: [
      { id: 'package', label: 'Package', placeholder: 'e.g. hobot_dnn' },
      { id: 'mode', label: 'Mode', options: ['a', 'b'], placeholder: 'pick one' },
      { id: 'target', label: 'Target' },
    ],
  };
  const d = pe.toDraft(def);
  assert.deepEqual(d.fields.map((f) => f.placeholder), ['e.g. hobot_dnn', 'pick one', '']);
  pe.load(d);
  const raw = pe.rawDraft();
  assert.equal(raw.fields[0].placeholder, 'e.g. hobot_dnn', 'a free-text hint is kept');
  assert.equal(raw.fields[1].placeholder, 'pick one', 'a hint on a choice field is kept too');
  assert.equal('placeholder' in raw.fields[2], false, 'a field with no hint gains none');
  // The validator is the last gate before the board; it must keep the hint.
  const { part, warnings } = normalizePart(raw);
  assert.deepEqual(warnings, []);
  assert.deepEqual(part.fields.map((f) => f.placeholder), ['e.g. hobot_dnn', 'pick one', undefined]);
});

test('Customize… on a built-in part keeps the placeholders its schema fields carry', () => {
  // definitionFrom is what Customize… starts from; the editor must not drop
  // what it hands over. RDK software stage has both kinds of field.
  const def = definitionFrom(nodePart({ kind: 'rdksoftware' }));
  const withHints = def.fields.filter((f) => f.placeholder);
  assert.ok(withHints.length >= 2, JSON.stringify(def.fields));
  const pe = draftPair();
  pe.load(pe.toDraft(def));
  const raw = pe.rawDraft();
  assert.deepEqual(
    raw.fields.map((f) => [f.id, f.placeholder]),
    def.fields.map((f) => [f.id, f.placeholder]),
    'every hint arrives unchanged',
  );
  assert.deepEqual(normalizePart(raw).part.fields, def.fields, 'and survives validation intact');
});
