import { getPart } from './palette.js';

let counter = 0;

export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function newDoc(title = 'Untitled Board') {
  return { schema: 1, title, nodes: [], wires: [], zones: [], notes: [], journey: [] };
}

const MAX_UNDO = 100;

export class Store {
  constructor(doc = newDoc()) {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = new Set();
    this.listeners = new Set();
    this._dragSnap = null;
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
    const snap = structuredClone(this.doc);
    fn(this.doc);
    this._push(snap);
    this.emit();
  }

  mutate(fn) {
    fn(this.doc);
    this.emit();
  }

  beginDrag() {
    this._dragSnap = structuredClone(this.doc);
  }

  endDrag() {
    if (this._dragSnap && JSON.stringify(this._dragSnap) !== JSON.stringify(this.doc)) {
      this._push(this._dragSnap);
    }
    this._dragSnap = null;
    this.emit();
  }

  cancelDrag() {
    if (this._dragSnap) {
      this.doc = this._dragSnap;
      this._dragSnap = null;
      this.emit();
    }
  }

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

export function addNode(store, kind, x, y) {
  const part = getPart(kind);
  const id = uid('n');
  store.apply((doc) => {
    doc.nodes.push({
      id, kind: part.kind, x, y, w: part.w, h: part.h,
      label: part.name, sublabel: '', color: null,
    });
  });
  return id;
}

export function addWire(store, bus, from, to) {
  const id = uid('w');
  store.apply((doc) => {
    doc.wires.push({ id, bus, from, to, label: '' });
  });
  return id;
}

export function addZone(store, rect, label = 'Zone') {
  const id = uid('z');
  store.apply((doc) => {
    doc.zones.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label, color: '#4a90d9' });
  });
  return id;
}

export function addNote(store, x, y, text = 'Note') {
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

export function updateItem(store, id, props) {
  store.apply((doc) => {
    const found = findItem(doc, id);
    if (found) Object.assign(found.item, props);
  });
}

export function deleteItems(store, ids) {
  if (!ids.length) return;
  const dead = new Set(ids);
  store.apply((doc) => {
    doc.nodes = doc.nodes.filter((n) => !dead.has(n.id));
    doc.zones = doc.zones.filter((z) => !dead.has(z.id));
    doc.notes = doc.notes.filter((n) => !dead.has(n.id));
    doc.wires = doc.wires.filter(
      (w) => !dead.has(w.id) && !dead.has(w.from.node) && !dead.has(w.to.node),
    );
    store._pruneSelection();
  });
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
