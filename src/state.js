import { getPart } from './palette.js';
import { normalizePart, partOf } from './custom.js';
import { tr, trd } from './i18n.js';

// Ids are random so that two tabs, two peers, or a script minting ids in the
// same millisecond never collide: 12 base36 characters (~62 bits) after the
// prefix. getRandomValues works outside secure contexts, unlike randomUUID.
const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 12;

export function uid(prefix = 'id') {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  let body = '';
  for (const b of bytes) body += ID_CHARS[b % 36];
  return prefix + body;
}

// The document format version this app writes. Bump it when a saved field
// changes meaning or shape, and add the matching step to MIGRATIONS in
// src/serialize.js so older files are upgraded on load.
export const SCHEMA_VERSION = 2;

export function newDoc(title = tr('Untitled Board')) {
  return { schema: SCHEMA_VERSION, title, nodes: [], wires: [], zones: [], notes: [], journey: [] };
}

const MAX_UNDO = 100;

export class Store {
  constructor(doc = newDoc()) {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = new Set();
    this.listeners = new Set();
    this._batchSnap = null;
    // Bumped by replaceDoc so subscribers can tell "a different board" from
    // "the same board edited" (the assistant clears its thread on the former).
    this.generation = 0;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  _push(snap) {
    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  apply(fn) {
    // Inside a batch the batch's own snapshot is the undo step: pushing one
    // here too would leave a second, half-way entry and clear the redo stack.
    if (this._batchSnap !== null) {
      this.mutate(fn);
      return;
    }
    const snap = structuredClone(this.doc);
    fn(this.doc);
    // A mutation that changed nothing (e.g. a blur committing an unedited
    // field) must not cost an undo step or clear the redo stack.
    if (JSON.stringify(snap) !== JSON.stringify(this.doc)) this._push(snap);
    this.emit();
  }

  mutate(fn) {
    fn(this.doc);
    this.emit();
  }

  // A batch collapses any number of mutate() calls into one undo step: a
  // pointer drag, or everything the assistant does in reply to one message.
  // A nested begin keeps the outer snapshot.
  beginBatch() {
    if (this._batchSnap === null) this._batchSnap = structuredClone(this.doc);
  }

  endBatch() {
    if (this._batchSnap && JSON.stringify(this._batchSnap) !== JSON.stringify(this.doc)) {
      this._push(this._batchSnap);
    }
    this._batchSnap = null;
    this.emit();
  }

  cancelBatch() {
    if (this._batchSnap) {
      this.doc = this._batchSnap;
      this._batchSnap = null;
      this.emit();
    }
  }

  inBatch() { return this._batchSnap !== null; }

  // The drag names stay for tools.js and main.js.
  beginDrag() { this.beginBatch(); }
  endDrag() { this.endBatch(); }
  cancelDrag() { this.cancelBatch(); }
  isDragging() { return this.inBatch(); }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo()) return;
    this.redoStack.push(structuredClone(this.doc));
    this.doc = this.undoStack.pop();
    this._pruneSelection();
    this.emit();
  }

  redo() {
    if (!this.canRedo()) return;
    this.undoStack.push(structuredClone(this.doc));
    this.doc = this.redoStack.pop();
    this._pruneSelection();
    this.emit();
  }

  replaceDoc(doc) {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.selection.clear();
    this.generation += 1;
    this.emit();
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.emit();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }

  clearSelection() {
    if (this.selection.size) {
      this.selection.clear();
      this.emit();
    }
  }

  _pruneSelection() {
    const ids = new Set(
      [...this.doc.nodes, ...this.doc.wires, ...this.doc.zones, ...this.doc.notes].map((i) => i.id),
    );
    for (const id of [...this.selection]) {
      if (!ids.has(id)) this.selection.delete(id);
    }
  }
}

export const NODE_STATUSES = ['planned', 'prototype', 'tested', 'production', 'deprecated'];

export const NODE_FLAGS = ['bug', 'thermal', 'power', 'lead', 'safety', 'eol'];

export function addNode(store, kind, x, y, part = null) {
  const def = kind === 'custom' && part ? normalizePart(part).part : null;
  // getPart maps an unknown kind (including a bare 'custom') to the generic box.
  const spec = def ? partOf({ kind: 'custom', part: def }) : getPart(kind);
  const id = uid('n');
  store.apply((doc) => {
    const node = {
      id, kind: spec.kind, x, y,
      // A custom part's name is the user's own text: it is never translated.
      label: def ? spec.name : trd(spec.defaultLabel || spec.name), sublabel: '', color: null,
      addr: '', rail: '', notes: '', status: null, flags: [],
    };
    if (def) node.part = def;
    doc.nodes.push(node);
  });
  return id;
}

export function addWire(store, bus, from, to) {
  const id = uid('w');
  store.apply((doc) => {
    doc.wires.push({ id, bus, from, to, label: '', arrow: null, style: null, flow: null });
  });
  return id;
}

// Move one end ('from' | 'to') of a wire onto another port; `bus` optionally
// retypes the wire at the same time (one undo step for both).
export function rewireEnd(store, id, end, ref, bus = null) {
  store.apply((doc) => {
    const wire = doc.wires.find((w) => w.id === id);
    if (!wire) return;
    wire[end] = { node: ref.node, port: ref.port };
    if (bus) wire.bus = bus;
  });
}

// Which bus a re-attached wire should carry, given the buses of its two port
// ends: an agreed bus wins, a current bus that still matches one end is kept,
// and null means the user has to choose.
export function resolveBus(current, busA, busB) {
  if (busA && busA === busB) return busA;
  if (current && (current === busA || current === busB)) return current;
  return null;
}

export function addZone(store, rect, label = tr('Zone')) {
  const id = uid('z');
  store.apply((doc) => {
    doc.zones.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label, color: '#4a90d9' });
  });
  return id;
}

export function addSwimlane(store, rect) {
  const id = uid('z');
  store.apply((doc) => {
    doc.zones.push({
      id,
      x: rect.x,
      y: rect.y,
      w: Math.max(rect.w, 320),
      h: Math.max(rect.h, 220),
      label: tr('Process'),
      color: '#a78bfa',
      kind: 'swimlane',
      orient: 'h',
      lanes: [tr('Lane {n}', { n: 1 }), tr('Lane {n}', { n: 2 }), tr('Lane {n}', { n: 3 })],
    });
  });
  return id;
}

export function addNote(store, x, y, text = tr('Note')) {
  const id = uid('t');
  store.apply((doc) => {
    doc.notes.push({ id, x, y, text });
  });
  return id;
}

export function findItem(doc, id) {
  for (const [type, arr] of [
    ['node', doc.nodes], ['wire', doc.wires], ['zone', doc.zones], ['note', doc.notes],
  ]) {
    const item = arr.find((i) => i.id === id);
    if (item) return { type, item };
  }
  return null;
}

// An `undefined` value removes the key rather than storing it: callers that
// clear an optional field (`{ fields: undefined }` when the last field is
// emptied) mean "no key", so the in-memory doc stays identical to what a save
// and reload would produce instead of relying on JSON.stringify dropping it.
// `null` is a value and is kept — the properties panel stores it to mean a
// choice was actively turned off.
export function updateItem(store, id, props) {
  store.apply((doc) => {
    const found = findItem(doc, id);
    if (!found) return;
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) delete found.item[key];
      else found.item[key] = value;
    }
  });
}

// ---- Locking ----
// A node, zone, or note may carry `locked: true`. A locked item stays
// selectable and editable; what the lock protects is its position and its
// existence. Wires need no lock: they follow the ports they are drawn to.

export function isLocked(item) {
  return !!item?.locked;
}

// What a Lock toggle over `ids` should do: lock them when any lockable item
// is still unlocked, unlock when they all are locked, and nothing at all when
// the selection holds no lockable item (wires only, or nothing).
export function nextLockState(doc, ids) {
  let any = false;
  for (const id of ids) {
    const found = findItem(doc, id);
    if (!found || found.type === 'wire') continue;
    if (!isLocked(found.item)) return true;
    any = true;
  }
  return any ? false : null;
}

// `false` removes the key rather than storing it, so a board that has never
// been locked serializes exactly as it did before this field existed.
export function setLock(store, ids, locked) {
  store.apply((doc) => {
    for (const id of ids) {
      const found = findItem(doc, id);
      if (!found || found.type === 'wire') continue;
      if (locked) found.item.locked = true;
      else delete found.item.locked;
    }
  });
}

// What a Delete says when the selection held locked items, or null when it
// held none. It lives here so the canvas and the panel word it the same way.
export function lockedKeptMessage(kept) {
  if (!kept) return null;
  if (kept === 1) return tr('1 locked item was kept. Unlock it with K to delete it.');
  return tr('{n} locked items were kept. Unlock them with K to delete them.', { n: kept });
}

// Locked items are kept back; the caller reports the count. A wire attached
// to a kept node survives with it, since only deleted nodes cascade.
export function deleteItems(store, ids) {
  const dead = new Set();
  let kept = 0;
  for (const id of ids) {
    const found = findItem(store.doc, id);
    if (found && isLocked(found.item)) kept += 1;
    else dead.add(id);
  }
  if (!dead.size) return { removed: 0, kept };
  store.apply((doc) => {
    doc.nodes = doc.nodes.filter((n) => !dead.has(n.id));
    doc.zones = doc.zones.filter((z) => !dead.has(z.id));
    doc.notes = doc.notes.filter((n) => !dead.has(n.id));
    doc.wires = doc.wires.filter(
      (w) => !dead.has(w.id) && !dead.has(w.from.node) && !dead.has(w.to.node),
    );
    store._pruneSelection();
  });
  return { removed: dead.size, kept };
}

export function duplicateItems(store, ids) {
  if (!ids.length) return [];
  const src = new Set(ids);
  const map = new Map();
  const newIds = [];
  store.apply((doc) => {
    for (const n of doc.nodes.filter((n) => src.has(n.id))) {
      const id = uid('n');
      map.set(n.id, id);
      newIds.push(id);
      doc.nodes.push({ ...structuredClone(n), id, x: n.x + 16, y: n.y + 16 });
    }
    for (const n of doc.nodes.filter((n) => newIds.includes(n.id) && n.kind === 'rdksoftware')) {
      if (map.has(n.fields?.target)) n.fields.target = map.get(n.fields.target);
    }
    for (const z of doc.zones.filter((z) => src.has(z.id))) {
      const id = uid('z');
      newIds.push(id);
      doc.zones.push({ ...structuredClone(z), id, x: z.x + 16, y: z.y + 16 });
    }
    for (const t of doc.notes.filter((t) => src.has(t.id))) {
      const id = uid('t');
      newIds.push(id);
      doc.notes.push({ ...structuredClone(t), id, x: t.x + 16, y: t.y + 16 });
    }
    for (const w of doc.wires.filter((w) => src.has(w.from.node) && src.has(w.to.node))) {
      const id = uid('w');
      doc.wires.push({
        ...structuredClone(w), id,
        from: { node: map.get(w.from.node), port: w.from.port },
        to: { node: map.get(w.to.node), port: w.to.port },
      });
    }
  });
  return newIds;
}
