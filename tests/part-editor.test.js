import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/palette.js';
import { initials, optionList, normalizePart, definitionFrom } from '../src/custom.js';
import { nodePart } from '../src/rdk/profiles.js';
import { Store, addNode, newDoc } from '../src/state.js';
import { initPartEditor } from '../src/ui/part-editor.js';

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

function editorFixture(t) {
  const elements = new Map();
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const get = id => {
    if (!elements.has(id)) {
      const listeners = new Map();
      const element = {
        value: '', hidden: false, checked: false, disabled: false, open: false,
        innerHTML: '', textContent: '', style: {},
        addEventListener: (type, fn) => {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        dispatch: type => { for (const fn of listeners.get(type) || []) fn({ target: element }); },
        querySelectorAll: () => [], setAttribute: () => {}, focus: () => {},
        showModal: () => { element.open = true; },
        close: () => { element.open = false; element.dispatch('close'); },
        getBoundingClientRect: () => ({ width: 800, height: 600 }),
      };
      elements.set(id, element);
    }
    return elements.get(id);
  };
  globalThis.document = { getElementById: get };
  const store = new Store();
  const saved = [];
  const editor = initPartEditor({
    store, library: { save: part => { saved.push(structuredClone(part)); return 'template'; } },
    svg: get('svg'), tools: { view: { x: 0, y: 0, zoom: 1 } },
  });
  return { store, saved, editor, get };
}

test('replacing the board cancels an open custom-part edit before it can overwrite reused IDs', t => {
  const { store, saved, editor, get } = editorFixture(t);
  const def = normalizePart({
    lib: 'template', name: 'Original', category: 'misc', icon: { text: 'O' }, ports: [], fields: [],
  }).part;
  const id = addNode(store, 'custom', 0, 0, def);
  editor.open({ def, nodeId: id, mode: 'edit' });
  get('pe-name').value = 'Stale edit';
  get('pe-name').dispatch('input');
  const replacement = newDoc('Replacement');
  replacement.nodes.push({ ...structuredClone(store.doc.nodes[0]), label: 'Replacement node' });
  store.replaceDoc(replacement);
  const before = structuredClone(store.doc);
  get('pe-save').dispatch('click');
  assert.deepEqual(store.doc, before);
  assert.equal(store.undoStack.length, 0);
  assert.equal(saved.length, 0, 'the stale draft must not change the library either');
  assert.equal(get('part-dialog').open, false, 'document replacement closes the old editor');
});

test('an active custom-part edit still saves to the board and library in one undo step', t => {
  const { store, saved, editor, get } = editorFixture(t);
  const def = normalizePart({
    lib: 'template', name: 'Original', category: 'misc', icon: { text: 'O' }, ports: [], fields: [],
  }).part;
  const id = addNode(store, 'custom', 0, 0, def);
  const before = structuredClone(store.doc), depth = store.undoStack.length;
  editor.open({ def, nodeId: id, mode: 'edit' });
  get('pe-name').value = 'Updated';
  get('pe-name').dispatch('input');
  get('pe-save').dispatch('click');
  assert.equal(store.doc.nodes[0].part.name, 'Updated');
  assert.equal(saved[0].name, 'Updated');
  assert.equal(store.undoStack.length, depth + 1);
  store.undo();
  assert.deepEqual(store.doc, before);
});
