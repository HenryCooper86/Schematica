import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire, addZone, addNote, updateItem, setLock } from '../src/state.js';
import { nodeRect, noteHeight } from '../src/geometry.js';
import { alignGroup } from '../src/ui/props.js';

// tools.js wires itself to the DOM at creation time, so a minimal fake of the
// pieces it touches (elements with closest/dataset/classList, document,
// window) stands in for a browser. Each test builds a fresh canvas.

function classListOf(el) {
  return {
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    toggle: (c, on) => { if (on) el.classes.add(c); else el.classes.delete(c); },
    contains: (c) => el.classes.has(c),
  };
}

function matches(el, sel) {
  const notIdx = sel.indexOf(':not(');
  if (notIdx >= 0) {
    const inner = sel.slice(notIdx + 5, -1);
    return matches(el, sel.slice(0, notIdx)) && !matches(el, inner);
  }
  if (sel.startsWith('.')) return el.classes.has(sel.slice(1));
  const m = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (!m) throw new Error(`unsupported selector ${sel}`);
  const key = m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
  if (m[2] === undefined) return el.dataset[key] !== undefined;
  return el.dataset[key] === m[2];
}

function makeEl({ tag = 'g', classes = [], dataset = {}, parent = null } = {}) {
  const el = {
    tagName: tag, classes: new Set(classes), dataset: { ...dataset }, parent, attrs: {},
    listeners: {}, hidden: true, style: {}, value: '', innerHTML: '',
  };
  el.classList = classListOf(el);
  el.closest = (sel) => {
    for (let cur = el; cur; cur = cur.parent) if (matches(cur, sel)) return cur;
    return null;
  };
  el.setAttribute = (k, v) => { el.attrs[k] = v; };
  el.removeAttribute = (k) => { delete el.attrs[k]; };
  el.hasAttribute = (k) => k in el.attrs;
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.removeEventListener = (type, fn) => { el.listeners[type] = (el.listeners[type] || []).filter((f) => f !== fn); };
  el.dispatch = (type, e) => { for (const fn of el.listeners[type] || []) fn(e); };
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  el.querySelectorAll = () => [];
  el.contains = () => false;
  el.focus = () => {};
  el.select = () => {};
  return el;
}

async function setup() {
  const svg = makeEl({ tag: 'svg' });
  const body = makeEl({ tag: 'BODY' });
  const popover = makeEl({ tag: 'DIV' });
  const editor = makeEl({ tag: 'INPUT' });
  // press.js's toast() writes into this one and arms a dismissal timer.
  const toastEl = makeEl({ tag: 'DIV' });
  toastEl.append = () => {};
  const doc = {
    body,
    getElementById: (id) => ({ 'bus-popover': popover, 'inline-editor': editor, toast: toastEl }[id]),
    querySelector: () => null,
    elementFromPoint: () => null,
  };
  const win = {
    listeners: {}, innerWidth: 1280, innerHeight: 800,
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    dispatch(type, e) { for (const fn of this.listeners[type] || []) fn(e); },
  };
  globalThis.document = doc;
  globalThis.window = win;
  const { createTools } = await import('../src/tools.js');
  const store = new Store();
  const toolChanges = [];
  const tools = createTools({
    svg, store, requestRender: () => {}, onToolChange: (t) => toolChanges.push(t),
  });
  // Cancel the pointerdown-time zoom offset so world == client coordinates.
  tools.view.x = 0;
  tools.view.y = 0;
  const ev = (target, extra = {}) => ({
    target, button: 0, clientX: 0, clientY: 0, pointerId: 1, shiftKey: false,
    metaKey: false, ctrlKey: false, prevented: false,
    preventDefault() { this.prevented = true; }, ...extra,
  });
  const key = (k, extra = {}) => ev(body, { key: k, ...extra });
  return { svg, body, doc, win, store, tools, editor, toastEl, toolChanges, ev, key };
}

function nodeEl(id, parent = null) {
  return makeEl({ dataset: { type: 'node', id }, parent });
}

function portEl(node, port) {
  return makeEl({ classes: ['portg'], dataset: { node, port } });
}

test('keys other than Escape are ignored while a move drag is in flight', async () => {
  const { svg, store, win, key, ev, toolChanges } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const el = nodeEl(a);
  svg.dispatch('pointerdown', ev(el, { clientX: 10, clientY: 10 }));
  assert.equal(store.isDragging(), true);
  const before = store.undoStack.length;
  win.dispatch('keydown', key('Delete'));
  assert.equal(store.doc.nodes.length, 1, 'Delete mid-drag does nothing');
  win.dispatch('keydown', key('z', { ctrlKey: true }));
  win.dispatch('keydown', key('d', { ctrlKey: true }));
  win.dispatch('keydown', key('c'));
  assert.deepEqual(toolChanges, [], 'no tool switch mid-drag');
  assert.equal(store.undoStack.length, before);
  assert.equal(store.doc.nodes.length, 1);
  // The gesture keeps working and Escape still abandons it.
  svg.dispatch('pointermove', ev(el, { clientX: 50, clientY: 10 }));
  assert.equal(store.doc.nodes[0].x, 40);
  win.dispatch('keydown', key('Escape'));
  assert.equal(store.isDragging(), false);
  assert.equal(store.doc.nodes[0].x, 0, 'Escape puts the card back');
});

test('a locked card is still selectable but never moves with a drag', async () => {
  const { svg, store, ev } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  setLock(store, [a], true);
  const el = nodeEl(a);
  svg.dispatch('pointerdown', ev(el, { clientX: 10, clientY: 10 }));
  assert.deepEqual([...store.selection], [a], 'the lock does not block selection');
  assert.equal(store.isDragging(), false, 'and no drag starts');
  svg.dispatch('pointermove', ev(el, { clientX: 90, clientY: 90 }));
  svg.dispatch('pointerup', ev(el, { clientX: 90, clientY: 90 }));
  assert.deepEqual([store.doc.nodes[0].x, store.doc.nodes[0].y], [0, 0]);
});

test('arrow keys nudge the unlocked half of a selection and leave the rest', async () => {
  const { store, win, key } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  setLock(store, [a], true);
  store.setSelection([a, b]);
  win.dispatch('keydown', key('ArrowRight', { shiftKey: true }));
  assert.equal(store.doc.nodes[0].x, 0, 'the locked card stays');
  assert.equal(store.doc.nodes[1].x, 308);
});

test('a dragged zone carries its unlocked cards and travels over the locked ones', async () => {
  const { svg, store, ev } = await setup();
  addNode(store, 'mcu', 100, 100);
  const pinned = addNode(store, 'temp', 200, 100);
  const z = addZone(store, { x: 40, y: 40, w: 400, h: 300 });
  setLock(store, [pinned], true);
  store.setSelection([z]);
  svg.dispatch('pointerdown', ev(makeEl({ dataset: { type: 'zone', id: z } }), { clientX: 0, clientY: 0 }));
  svg.dispatch('pointermove', ev(svg, { clientX: 40, clientY: 0 }));
  svg.dispatch('pointerup', ev(svg, { clientX: 40, clientY: 0 }));
  assert.equal(store.doc.zones[0].x, 80, 'the zone moves');
  assert.equal(store.doc.nodes[0].x, 140, 'its unlocked passenger comes along');
  assert.equal(store.doc.nodes[1].x, 200, 'the locked one stays behind');
});

test('a locked zone refuses a corner-handle resize', async () => {
  const { svg, store, ev } = await setup();
  const z = addZone(store, { x: 0, y: 0, w: 400, h: 300 });
  setLock(store, [z], true);
  store.setSelection([z]);
  const zoneEl = makeEl({ dataset: { type: 'zone', id: z } });
  const handle = makeEl({ dataset: { zhandle: 'se' }, parent: zoneEl });
  svg.dispatch('pointerdown', ev(handle, { clientX: 400, clientY: 300 }));
  svg.dispatch('pointermove', ev(svg, { clientX: 600, clientY: 500 }));
  svg.dispatch('pointerup', ev(svg, { clientX: 600, clientY: 500 }));
  assert.deepEqual([store.doc.zones[0].w, store.doc.zones[0].h], [400, 300]);
});

test('Delete removes the unlocked items and the toast counts what it kept', async () => {
  const { store, win, key, toastEl } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const t = addNote(store, 0, 400, 'pinned');
  setLock(store, [a, t], true);
  store.setSelection([a, b, t]);
  win.dispatch('keydown', key('Delete'));
  assert.deepEqual(store.doc.nodes.map((n) => n.id), [a]);
  assert.equal(store.doc.notes.length, 1);
  assert.match(toastEl.textContent, /^2 locked items were kept/);
});

test('K locks a mixed selection, then unlocks it once everything is locked', async () => {
  const { store, win, key } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  setLock(store, [a], true);
  store.setSelection([a, b]);
  win.dispatch('keydown', key('k'));
  assert.deepEqual(store.doc.nodes.map((n) => !!n.locked), [true, true]);
  win.dispatch('keydown', key('k'));
  assert.deepEqual(store.doc.nodes.map((n) => !!n.locked), [false, false]);
});

test('K with nothing selected costs no undo step', async () => {
  const { store, win, key } = await setup();
  addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  win.dispatch('keydown', key('k'));
  assert.equal(store.undoStack.length, depth);
});

test('a wire can still be drawn to a locked node\'s port', async () => {
  const { svg, store, doc, ev } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  setLock(store, [b], true);
  const target = portEl(b, 'i2c');
  doc.elementFromPoint = () => target;
  svg.dispatch('pointerdown', ev(portEl(a, 'i2c')));
  svg.dispatch('pointermove', ev(svg));
  assert.equal(target.hasAttribute('data-hot'), true, 'a lock protects position, not connectivity');
  svg.dispatch('pointerup', ev(svg));
  assert.equal(store.doc.wires.length, 1);
});

test('a tool key mid-wire keeps the draft, so pointermove has a cursor to update', async () => {
  const { svg, store, win, key, ev, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  svg.dispatch('pointerdown', ev(portEl(a, 'i2c')));
  assert.ok(tools.ui.wireDraft);
  win.dispatch('keydown', key('v'));
  assert.ok(tools.ui.wireDraft, 'the draft survives a tool key');
  assert.doesNotThrow(() => svg.dispatch('pointermove', ev(svg, { clientX: 30, clientY: 30 })));
  assert.deepEqual(tools.ui.wireDraft.cursor, { x: 30, y: 30 });
});

test('shift-clicking the only selected item off does not start a drag', async () => {
  const { svg, store, ev } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  store.setSelection([a]);
  const el = nodeEl(a);
  svg.dispatch('pointerdown', ev(el, { shiftKey: true }));
  assert.equal(store.selection.size, 0);
  assert.equal(store.isDragging(), false);
  assert.doesNotThrow(() => svg.dispatch('pointermove', ev(el, { clientX: 20, clientY: 20 })));
  assert.doesNotThrow(() => svg.dispatch('pointerup', ev(el, { clientX: 20, clientY: 20 })));
  assert.equal(store.doc.nodes[0].x, 0);
});

test('a wire cannot land on a port of its own node', async () => {
  const { svg, store, doc, ev } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  // Onto another port of the same node: no hot port, no wire.
  const own = portEl(a, 'spi');
  doc.elementFromPoint = () => own;
  svg.dispatch('pointerdown', ev(portEl(a, 'i2c')));
  svg.dispatch('pointermove', ev(svg));
  assert.equal(own.hasAttribute('data-hot'), false);
  svg.dispatch('pointerup', ev(svg));
  assert.equal(store.doc.wires.length, 0);
  // Onto another node: the port lights up and the wire is added.
  const other = portEl(b, 'i2c');
  doc.elementFromPoint = () => other;
  svg.dispatch('pointerdown', ev(portEl(a, 'i2c')));
  svg.dispatch('pointermove', ev(svg));
  assert.equal(other.hasAttribute('data-hot'), true);
  svg.dispatch('pointerup', ev(svg));
  assert.equal(store.doc.wires.length, 1);
});

test('re-attaching a wire end onto the other end\'s node is refused', async () => {
  const { svg, store, doc, ev } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.setSelection([w]);
  const wireEl = makeEl({ dataset: { type: 'wire', id: w } });
  const handle = makeEl({ dataset: { wend: 'to' }, parent: wireEl });
  doc.elementFromPoint = () => portEl(a, 'spi');
  svg.dispatch('pointerdown', ev(handle));
  svg.dispatch('pointerup', ev(svg));
  assert.deepEqual(store.doc.wires[0].to, { node: b, port: 'i2c' }, 'the wire stays put');
  doc.elementFromPoint = () => portEl(b, 'vcc');
  svg.dispatch('pointerdown', ev(handle));
  svg.dispatch('pointerup', ev(svg));
  assert.deepEqual(store.doc.wires[0].to, { node: b, port: 'vcc' }, 'another port of the far node is fine');
});

test('Space pans only when the canvas or the page has focus', async () => {
  const { svg, body, win, ev } = await setup();
  const button = makeEl({ tag: 'BUTTON' });
  const onButton = ev(button, { key: ' ' });
  win.dispatch('keydown', onButton);
  assert.equal(onButton.prevented, false, 'a focused button still activates on Space');
  assert.equal(svg.classList.contains('panning'), false);
  const onBody = ev(body, { key: ' ' });
  win.dispatch('keydown', onBody);
  assert.equal(onBody.prevented, true);
  assert.equal(svg.classList.contains('panning'), true);
  win.dispatch('keyup', ev(body, { key: ' ' }));
  const onSvg = ev(svg, { key: ' ' });
  win.dispatch('keydown', onSvg);
  assert.equal(onSvg.prevented, true);
});

test('clearing the last schema field drops the fields key instead of leaving {}', async () => {
  const { svg, store, editor, ev } = await setup();
  const a = addNode(store, 'threatactor', 0, 0);
  updateItem(store, a, { fields: { type: 'insider' } });
  const el = nodeEl(a);
  const line = makeEl({ dataset: { edit: 'fields.type' }, parent: el });
  // Two presses within the double-click window open the inline editor.
  svg.dispatch('pointerdown', ev(line));
  svg.dispatch('pointerdown', ev(line));
  assert.equal(editor.hidden, false);
  assert.equal(editor.value, 'insider');
  editor.value = '   ';
  editor.dispatch('keydown', { key: 'Enter', stopPropagation() {} });
  const node = store.doc.nodes[0];
  assert.equal(node.fields, undefined);
  assert.equal(JSON.stringify(node).includes('fields'), false, 'serializes without the key');
});

// ---- Align, distribute, tidy ----
// The arithmetic is covered in tests/align.test.js; what matters here is that
// the selection is measured the way the canvas draws it, that a moved zone
// carries its cards, and that one action is one undo step.

test('aligning right lines up the real right edges of differently sized cards', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 40, 200);
  updateItem(store, b, { label: 'a considerably longer card label' });
  const width = (id) => nodeRect(store.doc.nodes.find((n) => n.id === id)).w;
  assert.notEqual(width(a), width(b), 'the two cards must differ for this to prove anything');
  store.setSelection([a, b]);
  tools.alignSelection('right');
  const right = (id) => {
    const n = store.doc.nodes.find((x) => x.id === id);
    return n.x + nodeRect(n).w;
  };
  assert.equal(right(a), right(b));
});

test('aligning a zone carries its unlocked cards, as dragging it does', async () => {
  const { store, tools } = await setup();
  addNode(store, 'mcu', 120, 120);
  const pinned = addNode(store, 'temp', 220, 120);
  setLock(store, [pinned], true);
  const z = addZone(store, { x: 100, y: 100, w: 400, h: 300 });
  const far = addNode(store, 'mcu', 40, 600);
  store.setSelection([z, far]);
  tools.alignSelection('left');
  assert.equal(store.doc.zones[0].x, 40, 'the zone moves to the leftmost edge');
  assert.equal(store.doc.nodes[0].x, 60, 'its passenger keeps its place inside');
  assert.equal(store.doc.nodes[1].x, 220, 'the locked card stays behind');
  assert.equal(store.doc.nodes[2].x, 40, 'the card that was already leftmost is untouched');
});

test('a card that is selected as well as inside a selected zone takes its own target', async () => {
  const { store, tools } = await setup();
  const inside = addNode(store, 'mcu', 200, 120);
  const z = addZone(store, { x: 100, y: 100, w: 400, h: 300 });
  const far = addNode(store, 'mcu', 40, 600);
  store.setSelection([z, inside, far]);
  tools.alignSelection('left');
  assert.equal(store.doc.zones[0].x, 40);
  assert.equal(store.doc.nodes[0].x, 40, 'aligned on its own, not carried by the zone');
});

test('a card already on the target edge stays there when its zone moves too', async () => {
  const { store, tools } = await setup();
  // The card is the leftmost thing in the selection, so Align left has no move
  // to emit for it — and its centre falls inside the zone, so the zone would
  // otherwise carry the one card the user aligned straight off the edge.
  const a = addNode(store, 'mcu', 20, 120);
  const z = addZone(store, { x: 60, y: 100, w: 600, h: 300 });
  store.setSelection([a, z]);
  tools.alignSelection('left');
  assert.equal(store.doc.zones[0].x, 20, 'the zone comes to the card');
  assert.equal(store.doc.nodes[0].x, 20, 'and the card holds the edge it was aligned to');
});

test('tidy spacing leaves a card that is already in place, zone or no zone', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 120);
  const w = nodeRect(store.doc.nodes[0]).w;
  // `b` is already exactly one gap behind `a`, so the packed run has no move
  // for it, and its centre sits inside the zone that does move.
  const b = addNode(store, 'mcu', w + 20, 120);
  const z = addZone(store, { x: w + 36, y: 100, w: 600, h: 300 });
  store.setSelection([a, b, z]);
  tools.tidySelection(20);
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, w + 20], 'the run is already packed');
  assert.equal(store.doc.zones[0].x, (w + 20) * 2, 'only the zone moved');
});

test('distribute leaves the outer card behind when a zone in the run travels', async () => {
  const { store, tools } = await setup();
  // The last item of a run never moves, so `b` emits no move; the zone it sits
  // inside does, and used to take `b` with it.
  const a = addNode(store, 'mcu', 0, 120);
  const b = addNode(store, 'mcu', 1000, 120);
  const z = addZone(store, { x: 500, y: 100, w: 600, h: 300 });
  store.setSelection([a, b, z]);
  tools.distributeSelection('x');
  const w = nodeRect(store.doc.nodes[0]).w;
  const gap = (1000 + w - (w * 2 + 600)) / 2;
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, 1000], 'the two outermost cards hold still');
  assert.equal(store.doc.zones[0].x, w + gap);
});

test('one align is one undo step, and undo puts everything back', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 40, 200);
  const c = addNode(store, 'mcu', 90, 400);
  store.setSelection([a, b, c]);
  const depth = store.undoStack.length;
  tools.alignSelection('left');
  assert.equal(store.undoStack.length, depth + 1);
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, 0, 0]);
  store.undo();
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, 40, 90]);
  store.redo();
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, 0, 0]);
});

test('an align that changes nothing costs no undo step', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'mcu', 0, 200);
  store.setSelection([a, b]);
  const depth = store.undoStack.length;
  tools.alignSelection('left');
  assert.equal(store.undoStack.length, depth);
});

test('align results are not snapped to the grid, so the alignment survives', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 40, 200);
  updateItem(store, b, { label: 'a considerably longer card label' });
  store.setSelection([a, b]);
  assert.equal(tools.ui.snapOn, true, 'snapping is on, and align still ignores it');
  tools.alignSelection('hcenter');
  const center = (n) => n.x + nodeRect(n).w / 2;
  assert.equal(center(store.doc.nodes[0]), center(store.doc.nodes[1]));
});

test('the align state follows the selection and names the locked anchor', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'mcu', 300, 0);
  const c = addNode(store, 'mcu', 600, 0);
  store.setSelection([a]);
  assert.equal(tools.alignState().canAlign, false);
  store.setSelection([a, b]);
  assert.deepEqual([tools.alignState().canAlign, tools.alignState().canDistribute], [true, false]);
  store.setSelection([a, b, c]);
  assert.equal(tools.alignState().canDistribute, true);
  setLock(store, [c], true);
  const state = tools.alignState();
  assert.deepEqual([state.anchored, state.canAlign, state.canDistribute], [true, true, false]);
  // A selected wire is not an item to align.
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.setSelection([a, w]);
  assert.deepEqual([tools.alignState().applies, tools.alignState().canAlign], [true, false]);
});

test('a selection of nothing but wires gets no align group at all', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w1 = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const w2 = addWire(store, 'power', { node: a, port: 'vcc' }, { node: b, port: 'vcc' });
  store.setSelection([w1, w2]);
  assert.equal(tools.alignState().applies, false, 'wires follow their ports; nothing here to line up');
  assert.equal(alignGroup(tools.alignState(), 24), '');
  store.setSelection([a, w1]);
  assert.ok(alignGroup(tools.alignState(), 24).includes('data-align="left"'), 'one card is still what the group is about');
});

test('notes are measured by their wrapped height, not treated as points', async () => {
  const { store, tools } = await setup();
  const t = addNote(store, 0, 0, 'a note whose text wraps onto several lines of its own');
  const n = addNode(store, 'mcu', 300, 400);
  store.setSelection([t, n]);
  tools.alignSelection('bottom');
  const note = store.doc.notes[0];
  const node = store.doc.nodes[0];
  assert.equal(note.y + noteHeight(note.text), node.y + nodeRect(node).h);
});

test('tidy spacing packs the run along its dominant axis in one step', async () => {
  const { store, tools } = await setup();
  addNode(store, 'mcu', 0, 0);
  addNode(store, 'mcu', 400, 4);
  addNode(store, 'mcu', 900, 0);
  store.setSelection(store.doc.nodes.map((n) => n.id));
  const depth = store.undoStack.length;
  tools.tidySelection(20);
  const w = nodeRect(store.doc.nodes[0]).w;
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, w + 20, (w + 20) * 2]);
  assert.deepEqual(store.doc.nodes.map((n) => n.y), [0, 4, 0], 'the cross axis is left alone');
  assert.equal(store.undoStack.length, depth + 1);
});

test('distributing gives equal gaps between edges and leaves the outer cards', async () => {
  const { store, tools } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 200, 0);
  const c = addNode(store, 'mcu', 900, 0);
  updateItem(store, b, { label: 'a considerably longer card label' });
  store.setSelection([a, b, c]);
  tools.distributeSelection('x');
  const [n1, n2, n3] = store.doc.nodes;
  assert.equal(n1.x, 0);
  assert.equal(n3.x, 900);
  const gap1 = n2.x - (n1.x + nodeRect(n1).w);
  const gap2 = n3.x - (n2.x + nodeRect(n2).w);
  assert.ok(Math.abs(gap1 - gap2) < 0.02, `${gap1} vs ${gap2}`);
});

// A stand-in for navigator.clipboard: `deny` rejects both calls, the way a
// browser without a secure context or a granted permission does.
function fakeClipboard({ deny = false, text = '' } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const state = { text };
  const clipboard = {
    writeText: async (t) => { if (deny) throw new Error('denied'); state.text = t; },
    readText: async () => { if (deny) throw new Error('denied'); return state.text; },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true });
  const restore = () => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  };
  return { state, restore };
}

// The clipboard calls are awaited, so a dispatched keypress finishes a tick later.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Two wired cards, both selected.
function wiredPair(store) {
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.setSelection([a, b]);
  return { a, b };
}

test('Ctrl-C in a text field is left to the browser', async () => {
  const { win, store, ev } = await setup();
  const clip = fakeClipboard();
  try {
    wiredPair(store);
    const field = makeEl({ tag: 'INPUT' });
    const press = ev(field, { key: 'c', ctrlKey: true });
    win.dispatch('keydown', press);
    await settle();
    assert.equal(press.prevented, false, 'the native copy is untouched');
    assert.equal(clip.state.text, '', 'and nothing of ours reached the clipboard');
  } finally { clip.restore(); }
});

test('Ctrl-C copies the selection and Ctrl-V pastes it as one undo step', async () => {
  const { win, store, key, toastEl } = await setup();
  const clip = fakeClipboard();
  try {
    wiredPair(store);
    win.dispatch('keydown', key('c', { ctrlKey: true }));
    await settle();
    assert.match(clip.state.text, /"schematica":"clip"/);
    assert.equal(toastEl.textContent, '3 items copied to the clipboard.', 'the wire counts too');
    const before = store.undoStack.length;
    const originals = store.doc.nodes.map((n) => n.id);
    win.dispatch('keydown', key('v', { metaKey: true }));
    await settle();
    assert.equal(store.doc.nodes.length, 4);
    assert.equal(store.doc.wires.length, 2);
    assert.equal(store.undoStack.length, before + 1, 'one undo step');
    assert.equal(store.selection.size, 3, 'exactly what was pasted is selected');
    assert.equal(originals.some((id) => store.selection.has(id)), false, 'and none of the originals');
    store.undo();
    assert.equal(store.doc.nodes.length, 2);
  } finally { clip.restore(); }
});

test('Ctrl-X copies a locked item but leaves it on the board, and says how many stayed', async () => {
  const { win, store, key, toastEl } = await setup();
  const clip = fakeClipboard();
  try {
    const { a } = wiredPair(store);
    setLock(store, [a], true);
    win.dispatch('keydown', key('x', { ctrlKey: true }));
    await settle();
    assert.equal(store.doc.nodes.length, 1, 'only the locked card is left');
    assert.equal(store.doc.nodes[0].id, a);
    assert.match(toastEl.textContent, /^3 items cut to the clipboard\. 1 locked item was kept\./);
    assert.match(clip.state.text, new RegExp(`"${a}"`), 'the locked card still travelled');
  } finally { clip.restore(); }
});

test('a denied clipboard keeps copy and paste working inside the tab, and says so', async () => {
  const { win, store, key, toastEl } = await setup();
  const clip = fakeClipboard({ deny: true });
  try {
    wiredPair(store);
    win.dispatch('keydown', key('c', { ctrlKey: true }));
    await settle();
    assert.match(toastEl.textContent, /stays in this tab/);
    win.dispatch('keydown', key('v', { ctrlKey: true }));
    await settle();
    assert.equal(store.doc.nodes.length, 4, 'the in-tab copy stood in for the clipboard');
  } finally { clip.restore(); }
});

test('ordinary text on the clipboard leaves the board alone and explains itself', async () => {
  const { win, store, key, toastEl } = await setup();
  const clip = fakeClipboard({ text: 'a shopping list' });
  try {
    wiredPair(store);
    const before = store.undoStack.length;
    win.dispatch('keydown', key('v', { ctrlKey: true }));
    await settle();
    assert.equal(store.doc.nodes.length, 2);
    assert.equal(store.undoStack.length, before, 'a refused paste costs no undo step');
    assert.match(toastEl.textContent, /does not hold a copied selection/);
  } finally { clip.restore(); }
});

test('copy, cut, and paste stay out while the assistant holds the canvas', async () => {
  const { win, store, tools, key } = await setup();
  const clip = fakeClipboard();
  try {
    wiredPair(store);
    win.dispatch('keydown', key('c', { ctrlKey: true }));
    await settle();
    tools.ui.busy = true;
    win.dispatch('keydown', key('v', { ctrlKey: true }));
    win.dispatch('keydown', key('x', { ctrlKey: true }));
    await settle();
    assert.equal(store.doc.nodes.length, 2, 'nothing pasted and nothing cut');
  } finally { clip.restore(); }
});

// A stand-in for window.getSelection(): whether the page has words highlighted.
// Most of the app's text is outside form controls, so this is the only thing
// that tells an ordinary text selection from none.
function fakeTextSelection(text) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'getSelection');
  Object.defineProperty(globalThis, 'getSelection', {
    value: () => ({ isCollapsed: !text, toString: () => text }),
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'getSelection', original);
    else delete globalThis.getSelection;
  };
}

test('highlighted text anywhere on the page keeps Ctrl-C, X, and V to itself', async () => {
  const { win, store, key } = await setup();
  const clip = fakeClipboard();
  // The assistant transcript is a plain <aside>, so a reply the user selected
  // is not in any text field — only the document selection knows about it.
  const restore = fakeTextSelection('a paragraph of the reply');
  try {
    wiredPair(store);
    for (const k of ['c', 'x', 'v']) {
      const press = key(k, { ctrlKey: true });
      win.dispatch('keydown', press);
      await settle();
      assert.equal(press.prevented, false, `Ctrl-${k} is left to the browser`);
    }
    assert.equal(clip.state.text, '', 'the highlighted text was not overwritten');
    assert.equal(store.doc.nodes.length, 2, 'and the cut removed nothing');
  } finally { restore(); clip.restore(); }
});

test('a collapsed selection is no selection, so the board keeps the clipboard keys', async () => {
  const { win, store, key } = await setup();
  const clip = fakeClipboard();
  const restore = fakeTextSelection('');
  try {
    wiredPair(store);
    const press = key('c', { ctrlKey: true });
    win.dispatch('keydown', press);
    await settle();
    assert.equal(press.prevented, true);
    assert.match(clip.state.text, /"schematica":"clip"/);
  } finally { restore(); clip.restore(); }
});

test('Ctrl-A selects every card, zone, and note and leaves the wires to their ports', async () => {
  const { win, store, key } = await setup();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const z = addZone(store, { x: 0, y: 0, w: 400, h: 300 });
  const t = addNote(store, 0, 400, 'a note');
  const press = key('a', { ctrlKey: true });
  win.dispatch('keydown', press);
  assert.equal(press.prevented, true, 'the browser does not select the page text instead');
  assert.deepEqual([...store.selection].sort(), [a, b, z, t].sort());
  assert.equal(store.selection.has(w), false, 'a wire has no position of its own to act on');
});

test('Ctrl-A is guarded like the other editing shortcuts', async () => {
  const { win, store, tools, ev, key } = await setup();
  addNode(store, 'mcu', 0, 0);
  const inField = ev(makeEl({ tag: 'INPUT' }), { key: 'a', ctrlKey: true });
  win.dispatch('keydown', inField);
  assert.equal(inField.prevented, false, 'select-all inside a field stays the browser\'s');
  assert.equal(store.selection.size, 0);
  tools.ui.busy = true;
  win.dispatch('keydown', key('a', { ctrlKey: true }));
  assert.equal(store.selection.size, 0, 'and the canvas is inert mid-request');
});

test('Ctrl-A feeds the multi-selection actions it exists for', async () => {
  const { win, store, tools, key } = await setup();
  addNode(store, 'mcu', 0, 0);
  addNode(store, 'temp', 40, 200);
  addNode(store, 'mcu', 90, 400);
  win.dispatch('keydown', key('a', { ctrlKey: true }));
  assert.equal(tools.alignState().canDistribute, true);
  tools.alignSelection('left');
  assert.deepEqual(store.doc.nodes.map((n) => n.x), [0, 0, 0]);
});
