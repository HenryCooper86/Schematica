import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClip, clipCount, encodeClip, readClip, pasteOffset, materializeClip, pasteInto,
  copiedMessage, pastedMessage, CLIP_MARK, CLIP_VERSION, MAX_CLIP_ITEMS, MAX_CLIP_CHARS,
} from '../src/clipboard.js';
import {
  Store, addNode, addWire, addZone, addNote, setLock, SCHEMA_VERSION,
} from '../src/state.js';
import { normalizePart } from '../src/custom.js';
import { initI18n, setLang } from '../src/i18n.js';

// A board with two wired cards, a zone around them, and a note beside it.
function sample() {
  const store = new Store();
  const a = addNode(store, 'mcu', 100, 100);
  const b = addNode(store, 'temp', 400, 100);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const z = addZone(store, { x: 50, y: 50, w: 500, h: 300 }, 'Board');
  const t = addNote(store, 600, 50, 'decoupling caps');
  return { store, a, b, w, z, t };
}

// Ids a test can read: n1, n2, w1, ...
function counter() {
  const seen = {};
  return (prefix) => {
    seen[prefix] = (seen[prefix] || 0) + 1;
    return `${prefix}${seen[prefix]}`;
  };
}

// ---- building a payload ----

test('a payload carries the selected items and the wires wholly inside it', () => {
  const { store, a, b, z, t } = sample();
  const clip = buildClip(store.doc, [a, b, z, t]);
  assert.equal(clip.schematica, CLIP_MARK);
  assert.equal(clip.v, CLIP_VERSION);
  assert.equal(clip.schema, SCHEMA_VERSION);
  assert.deepEqual(clip.nodes.map((n) => n.id), [a, b]);
  assert.equal(clip.wires.length, 1);
  assert.deepEqual(clip.zones.map((x) => x.id), [z]);
  assert.deepEqual(clip.notes.map((x) => x.id), [t]);
  assert.equal(clipCount(clip), 5);
});

test('a wire with one end outside the selection is dropped', () => {
  const { store, a, w } = sample();
  const clip = buildClip(store.doc, [a, w]);
  assert.deepEqual(clip.wires, [], 'the other end would have nothing to land on');
  assert.equal(clipCount(clip), 1);
});

test('a selection of nothing, or of wires only, has nothing to copy', () => {
  const { store, w } = sample();
  assert.equal(buildClip(store.doc, []), null);
  assert.equal(buildClip(store.doc, [w]), null);
});

test('the payload is a copy: editing the board afterwards cannot change it', () => {
  const { store, a } = sample();
  const clip = buildClip(store.doc, [a]);
  store.doc.nodes[0].label = 'edited';
  assert.equal(clip.nodes[0].label, 'MCU');
});

test('a locked item travels locked', () => {
  const { store, a } = sample();
  setLock(store, [a], true);
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a])));
  assert.equal(clip.nodes[0].locked, true);
});

test('a custom card carries its own definition, so a board that never saw the part can draw it', () => {
  const store = new Store();
  const def = {
    lib: 'tpl1', name: 'Motor driver', category: 'misc', accent: '#ff0000',
    icon: { text: 'MD' }, ports: [{ id: 'p1', name: 'IN', side: 'left', bus: 'gpio' }], fields: [],
  };
  const id = addNode(store, 'custom', 10, 10, def);
  const { clip } = readClip(encodeClip(buildClip(store.doc, [id])));
  assert.equal(clip.nodes[0].kind, 'custom');
  assert.equal(clip.nodes[0].part.name, 'Motor driver');
  assert.deepEqual(clip.nodes[0].part.ports.map((p) => p.id), ['p1']);
});

// ---- reading an untrusted payload ----

test('a round trip through the clipboard text preserves the items', () => {
  const { store, a, b, z, t } = sample();
  const { clip, warnings } = readClip(encodeClip(buildClip(store.doc, [a, b, z, t])));
  assert.deepEqual(warnings, []);
  assert.deepEqual(clip.nodes.map((n) => n.id), [a, b]);
  assert.equal(clip.wires.length, 1);
  assert.equal(clip.zones.length, 1);
  assert.equal(clip.notes.length, 1);
});

test('ordinary text on the clipboard is refused, not parsed', () => {
  assert.throws(() => readClip('just some notes I copied'), /does not hold a copied selection/);
  assert.throws(() => readClip(''), /nothing to paste/);
  assert.throws(() => readClip(null), /nothing to paste/);
  assert.throws(() => readClip('{"nodes":[]}'), /does not hold a copied selection/);
  assert.throws(() => readClip('[1,2,3]'), /does not hold a copied selection/);
  assert.throws(() => readClip('{"schematica":"clip"'), /does not hold a copied selection/);
});

test('a payload with no usable version is refused', () => {
  assert.throws(() => readClip('{"schematica":"clip","nodes":[]}'), /no usable version/);
  assert.throws(() => readClip('{"schematica":"clip","v":"1","nodes":[]}'), /no usable version/);
  assert.throws(() => readClip('{"schematica":"clip","v":0,"nodes":[]}'), /no usable version/);
});

test('a payload from a future version pastes what this build understands, with a warning', () => {
  const { store, a } = sample();
  const clip = { ...buildClip(store.doc, [a]), v: CLIP_VERSION + 99 };
  const read = readClip(encodeClip(clip));
  assert.equal(read.clip.nodes.length, 1);
  assert.match(read.warnings[0], /newer version/);
});

test('a payload with nothing placeable is refused rather than pasted empty', () => {
  assert.throws(
    () => readClip(JSON.stringify({ schematica: 'clip', v: 1, nodes: [], wires: [], zones: [], notes: [] })),
    /Nothing in the copied selection/,
  );
});

test('a malformed payload produces a message, never an exception from the loader', () => {
  const bad = JSON.stringify({ schematica: 'clip', v: 1, nodes: 'not a list' });
  assert.throws(() => readClip(bad), /malformed|Nothing in the copied selection/);
});

test('the item cap is stated and enforced before anything is parsed into items', () => {
  const nodes = Array.from({ length: MAX_CLIP_ITEMS + 1 }, (_, i) => ({ id: `n${i}`, kind: 'mcu', x: 0, y: 0 }));
  assert.throws(
    () => readClip(JSON.stringify({ schematica: 'clip', v: 1, nodes })),
    new RegExp(`limited to ${MAX_CLIP_ITEMS} items; this selection holds ${MAX_CLIP_ITEMS + 1}`),
  );
});

test('an oversized clipboard text is refused without parsing it', () => {
  assert.throws(() => readClip('x'.repeat(MAX_CLIP_CHARS + 1)), /too large to paste/);
});

test('an unknown kind becomes a custom box instead of reaching the board', () => {
  const raw = JSON.stringify({
    schematica: 'clip', v: 1,
    nodes: [{ id: 'n1', kind: 'evil-kind', x: 0, y: 0 }],
  });
  const { clip, warnings } = readClip(raw);
  assert.equal(clip.nodes[0].kind, 'generic');
  assert.ok(warnings.some((w) => /became a custom box/.test(w)));
});

test('out-of-range coordinates and over-long text are pulled back into range', () => {
  const raw = JSON.stringify({
    schematica: 'clip', v: 1,
    nodes: [{ id: 'n1', kind: 'mcu', x: 1e12, y: -1e12, label: 'z'.repeat(50000) }],
  });
  const { clip, warnings } = readClip(raw);
  assert.equal(clip.nodes[0].x, 1e6);
  assert.equal(clip.nodes[0].y, -1e6);
  assert.equal(clip.nodes[0].label.length, 20000);
  assert.equal(warnings.length, 2);
});

test('a prototype-polluting key cannot ride in on a node or its fields', () => {
  const raw = '{"schematica":"clip","v":1,"nodes":[{"id":"n1","kind":"mcu","x":0,"y":0,'
    + '"__proto__":{"polluted":true},"fields":{"__proto__":{"polluted":true},"constructor":"x"}}]}';
  const { clip } = readClip(raw);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(clip.nodes[0].fields, undefined, 'an MCU has no schema fields');
  assert.equal(Object.hasOwn(clip.nodes[0], 'polluted'), false);
});

test('a wire whose port no longer exists is dropped, and the rest of the paste survives', () => {
  const { store, a, b } = sample();
  const clip = buildClip(store.doc, [a, b]);
  clip.wires[0].from.port = 'a-pin-this-part-never-had';
  const { clip: read, warnings } = readClip(encodeClip(clip));
  assert.equal(read.nodes.length, 2);
  assert.deepEqual(read.wires, []);
  assert.ok(warnings.some((w) => /missing endpoint/.test(w)));
});

test('a duplicate id inside one payload is dropped rather than pasted twice', () => {
  const raw = JSON.stringify({
    schematica: 'clip', v: 1,
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0 }, { id: 'n1', kind: 'mcu', x: 9, y: 9 }],
  });
  const { clip, warnings } = readClip(raw);
  assert.equal(clip.nodes.length, 1);
  assert.ok(warnings.some((w) => /Dropped duplicate id/.test(w)));
});

// ---- where a paste lands ----

test('a paste over the board it was copied from steps clear of the original', () => {
  const { store, a, b } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b])));
  assert.deepEqual(pasteOffset(store.doc, clip), { dx: 16, dy: 16 });
});

test('a paste onto a board that never held these items keeps the coordinates they were drawn at', () => {
  const { store, a, b } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b])));
  const other = new Store();
  addNode(other, 'mcu', 999, 999);
  assert.deepEqual(pasteOffset(other.doc, clip), { dx: 0, dy: 0 });
});

test('pasting the same payload twice cascades instead of stacking out of sight', () => {
  const { store, a } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a])));
  const first = pasteInto(store, clip, { mint: counter() });
  assert.deepEqual([store.doc.nodes[2].x, store.doc.nodes[2].y], [116, 116]);
  const second = pasteInto(store, clip, { mint: counter() });
  assert.deepEqual([store.doc.nodes[3].x, store.doc.nodes[3].y], [132, 132]);
  assert.notDeepEqual(first, second);
});

test('a cross-board paste of the same payload twice also steps aside', () => {
  const { store, a } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a])));
  const other = new Store();
  pasteInto(other, clip, { mint: counter() });
  pasteInto(other, clip, { mint: counter() });
  assert.deepEqual(other.doc.nodes.map((n) => n.x), [100, 116]);
});

// ---- materializing ----

test('a paste mints fresh ids and remaps the wire onto them', () => {
  const { store, a, b } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b])));
  const made = materializeClip(clip, { offset: { dx: 16, dy: 16 }, mint: counter() });
  assert.deepEqual(made.nodes.map((n) => n.id), ['n1', 'n2']);
  assert.deepEqual(made.wires.map((w) => w.id), ['w1']);
  assert.deepEqual(made.wires[0].from, { node: 'n1', port: 'i2c' });
  assert.deepEqual(made.wires[0].to, { node: 'n2', port: 'i2c' });
  assert.deepEqual(made.nodes.map((n) => [n.x, n.y]), [[116, 116], [416, 116]]);
  assert.deepEqual(made.ids, ['n1', 'n2', 'w1']);
});

test('a minted id that collides with the board is minted again', () => {
  const { store, a } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a])));
  const taken = new Set(['n1', 'n2']);
  const made = materializeClip(clip, { mint: counter(), taken });
  assert.deepEqual(made.nodes.map((n) => n.id), ['n3']);
});

test('a pasted RDK software stage points at the pasted board, not the original', () => {
  const store = new Store();
  const board = addNode(store, 'aisbc', 0, 0);
  const stage = addNode(store, 'rdksoftware', 200, 0);
  store.doc.nodes[1].fields = { package: 'hobot_dnn', target: board };
  const { clip } = readClip(encodeClip(buildClip(store.doc, [board, stage])));
  const made = materializeClip(clip, { mint: counter() });
  assert.equal(made.nodes[1].fields.target, made.nodes[0].id);
});

test('an RDK software stage pasted without its board keeps naming the board it left behind', () => {
  const store = new Store();
  const board = addNode(store, 'aisbc', 0, 0);
  const stage = addNode(store, 'rdksoftware', 200, 0);
  store.doc.nodes[1].fields = { package: 'hobot_dnn', target: board };
  const { clip } = readClip(encodeClip(buildClip(store.doc, [stage])));
  const made = materializeClip(clip, { mint: counter() });
  assert.equal(made.nodes[0].fields.target, board, 'the same board is still on this board');
});

test('a zone and the cards inside it keep their layout, so the cards land inside the copy', () => {
  const { store, a, b, z } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b, z])));
  const made = materializeClip(clip, { offset: { dx: 40, dy: 40 }, mint: counter() });
  const zone = made.zones[0];
  for (const n of made.nodes) {
    assert.ok(n.x > zone.x && n.x < zone.x + zone.w, 'card stays within the pasted zone');
    assert.ok(n.y > zone.y && n.y < zone.y + zone.h);
  }
  assert.deepEqual([zone.x, zone.y, zone.w, zone.h], [90, 90, 500, 300]);
});

// ---- custom parts and the reader's own library ----

function customClip(def) {
  const store = new Store();
  const id = addNode(store, 'custom', 10, 10, def);
  return readClip(encodeClip(buildClip(store.doc, [id]))).clip;
}

const DEF = {
  lib: 'tpl1', name: 'Motor driver', category: 'misc', accent: null,
  icon: { text: 'MD' }, ports: [{ id: 'p1', name: 'IN', side: 'left', bus: 'gpio' }], fields: [],
};

// What createLibrary stores under a template id: a normalized definition with
// the `lib` link stripped.
function template(def) {
  const part = normalizePart(def).part;
  delete part.lib;
  return { id: def.lib, ...part, updated: '2026-01-01T00:00:00.000Z' };
}

test('a pasted custom card keeps its template link when the local template is the same part', () => {
  const clip = customClip(DEF);
  const made = materializeClip(clip, { mint: counter(), known: () => template(DEF) });
  assert.equal(made.nodes[0].part.lib, 'tpl1');
});

test('a template id that means something else here loses the link, and the local template is untouched', () => {
  const local = template({ ...DEF, name: 'Relay board', ports: [] });
  const clip = customClip(DEF);
  const made = materializeClip(clip, { mint: counter(), known: () => local });
  assert.equal(made.nodes[0].part.lib, undefined, 'the link is cut, not the definition');
  assert.equal(made.nodes[0].part.name, 'Motor driver', 'the card is still drawn as it was copied');
  assert.deepEqual(local.ports, [], 'nothing here writes to the library');
});

test('a template this browser has never seen loses the link too, since nothing can honour it', () => {
  const made = materializeClip(customClip(DEF), { mint: counter(), known: () => null });
  assert.equal(made.nodes[0].part.lib, undefined);
});

test('a card already on the board settles what a template id means locally', () => {
  const store = new Store();
  addNode(store, 'custom', 500, 500, DEF);
  const ids = pasteInto(store, customClip(DEF), {
    mint: counter(), templateFor: () => template({ ...DEF, name: 'Relay board' }),
  });
  const pasted = store.doc.nodes.find((n) => n.id === ids[0]);
  assert.equal(pasted.part.lib, 'tpl1', 'its sibling on this board agrees, whatever the library says');
});

// ---- pasting into a store ----

test('a paste is one undo step and selects exactly what it added', () => {
  const { store, a, b, z, t } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b, z, t])));
  const target = new Store();
  addNode(target, 'mcu', 0, 0);
  const before = target.undoStack.length;
  const ids = pasteInto(target, clip, { mint: counter() });
  assert.equal(target.undoStack.length, before + 1, 'one undo step');
  assert.equal(target.doc.nodes.length, 3);
  assert.equal(target.doc.wires.length, 1);
  assert.equal(target.doc.zones.length, 1);
  assert.equal(target.doc.notes.length, 1);
  assert.equal(ids.length, 5);
  target.undo();
  assert.equal(target.doc.nodes.length, 1, 'and one undo takes the whole paste back');
  assert.equal(target.doc.wires.length, 0);
});

test('a paste never disturbs what is already on the board', () => {
  const { store, a, b } = sample();
  const { clip } = readClip(encodeClip(buildClip(store.doc, [a, b])));
  const before = JSON.stringify(store.doc.nodes.map((n) => n.id));
  const ids = pasteInto(store, clip, { mint: counter() });
  assert.equal(JSON.stringify(store.doc.nodes.slice(0, 2).map((n) => n.id)), before);
  assert.equal(new Set([...ids, a, b]).size, ids.length + 2, 'no pasted id collides with an original');
});

// ---- what the toasts say ----

test('counts read as singular or plural, and a cut says so', () => {
  initI18n({ storage: null });
  setLang('en');
  assert.equal(copiedMessage(1), '1 item copied to the clipboard.');
  assert.equal(copiedMessage(4), '4 items copied to the clipboard.');
  assert.equal(copiedMessage(1, { cut: true }), '1 item cut to the clipboard.');
  assert.equal(copiedMessage(4, { cut: true }), '4 items cut to the clipboard.');
  assert.equal(pastedMessage(1), '1 item pasted.');
  assert.equal(pastedMessage(4), '4 items pasted.');
});

test('the messages are translated', () => {
  initI18n({ storage: null });
  setLang('zh');
  assert.match(copiedMessage(2), /^已复制 2 项/);
  assert.match(pastedMessage(2), /^已粘贴 2 项/);
  assert.throws(() => readClip('nope'), /剪贴板/);
  setLang('en');
});
