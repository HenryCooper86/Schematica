import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uid, newDoc, Store, addNode, addWire, addZone, addNote,
  findItem, updateItem, deleteItems, duplicateItems,
} from '../src/state.js';
import { PARTS } from '../src/palette.js';

test('uid is unique and prefixed', () => {
  const a = uid('n');
  const b = uid('n');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('n'));
});

test('newDoc shape', () => {
  const doc = newDoc('X');
  assert.deepEqual(doc, { schema: 1, title: 'X', nodes: [], wires: [], zones: [], notes: [], journey: [] });
});

test('addNode uses part defaults', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 100, 50);
  const node = store.doc.nodes[0];
  assert.equal(node.id, id);
  assert.equal(node.kind, 'mcu');
  assert.equal(node.w, PARTS.mcu.w);
  assert.equal(node.label, 'MCU');
  assert.equal(node.sublabel, '');
  assert.equal(node.addr, '');
  assert.equal(node.rail, '');
  assert.equal(node.notes, '');
  assert.equal(node.status, null);
  assert.deepEqual(node.flags, []);
});

test('node status and flag vocabularies are exported and non-empty', async () => {
  const { NODE_STATUSES, NODE_FLAGS } = await import('../src/state.js');
  assert.ok(NODE_STATUSES.length >= 5);
  assert.ok(NODE_FLAGS.length >= 6);
  assert.ok(NODE_STATUSES.includes('prototype'));
  assert.ok(NODE_FLAGS.includes('bug'));
});

test('addNode with unknown kind becomes generic', () => {
  const store = new Store();
  addNode(store, 'nope', 0, 0);
  assert.equal(store.doc.nodes[0].kind, 'generic');
});

test('updateItem and findItem', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  updateItem(store, id, { label: 'Brain', sublabel: 'STM32' });
  const found = findItem(store.doc, id);
  assert.equal(found.type, 'node');
  assert.equal(found.item.label, 'Brain');
  assert.equal(findItem(store.doc, 'missing'), null);
});

test('undo/redo roundtrip', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  assert.equal(store.doc.nodes.length, 1);
  assert.ok(store.canUndo());
  store.undo();
  assert.equal(store.doc.nodes.length, 0);
  assert.ok(store.canRedo());
  store.redo();
  assert.equal(store.doc.nodes.length, 1);
});

test('new apply clears redo stack', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  store.undo();
  addNode(store, 'temp', 0, 0);
  assert.ok(!store.canRedo());
});

test('undo stack caps at 100', () => {
  const store = new Store();
  for (let i = 0; i < 120; i++) store.apply((doc) => { doc.title = `t${i}`; });
  assert.equal(store.undoStack.length, 100);
});

test('drag lifecycle creates one undo entry only when changed', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  store.beginDrag();
  store.mutate((doc) => { doc.nodes[0].x = 200; });
  store.endDrag();
  assert.equal(store.undoStack.length, depth + 1);
  store.undo();
  assert.equal(store.doc.nodes[0].x, 0);
  // no-op drag adds nothing
  const depth2 = store.undoStack.length;
  store.beginDrag();
  store.endDrag();
  assert.equal(store.undoStack.length, depth2);
  assert.ok(findItem(store.doc, id));
});

test('cancelDrag restores the snapshot', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  store.beginDrag();
  store.mutate((doc) => { doc.nodes[0].x = 999; });
  store.cancelDrag();
  assert.equal(store.doc.nodes[0].x, 0);
});

test('deleteItems cascades to attached wires', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  deleteItems(store, [b]);
  assert.equal(store.doc.nodes.length, 1);
  assert.equal(store.doc.wires.length, 0);
  assert.ok(findItem(store.doc, a));
  assert.equal(findItem(store.doc, w), null);
});

test('deleteItems prunes cascade-deleted wires from the selection', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.setSelection([w]);
  deleteItems(store, [b]);
  assert.equal(store.selection.size, 0);
});

test('deleteItems with empty list is a no-op (no undo entry)', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  deleteItems(store, []);
  assert.equal(store.undoStack.length, depth);
});

test('duplicateItems clones nodes, remaps internal wires, offsets copies', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const newIds = duplicateItems(store, [a, b]);
  assert.equal(newIds.length, 2);
  assert.equal(store.doc.nodes.length, 4);
  assert.equal(store.doc.wires.length, 2);
  const clone = store.doc.nodes.find((n) => n.id === newIds[0]);
  assert.equal(clone.x, 16);
  const newWire = store.doc.wires[1];
  assert.ok(newIds.includes(newWire.from.node));
  assert.ok(newIds.includes(newWire.to.node));
});

test('duplicateItems drops wires crossing the selection boundary', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  duplicateItems(store, [a]);
  assert.equal(store.doc.wires.length, 1);
});

test('zones and notes add and duplicate', () => {
  const store = new Store();
  const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
  const t = addNote(store, 10, 10, 'hello');
  assert.equal(findItem(store.doc, z).type, 'zone');
  assert.equal(findItem(store.doc, t).type, 'note');
  const ids = duplicateItems(store, [z, t]);
  assert.equal(ids.length, 2);
  assert.equal(store.doc.zones.length, 2);
  assert.equal(store.doc.notes.length, 2);
});

test('selection prunes after undo removes items', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  store.setSelection([id]);
  store.undo();
  assert.equal(store.selection.size, 0);
});

test('subscribe fires on emit and unsubscribes', () => {
  const store = new Store();
  let calls = 0;
  const off = store.subscribe(() => calls++);
  addNode(store, 'mcu', 0, 0);
  off();
  addNode(store, 'mcu', 0, 0);
  assert.equal(calls, 1);
});

test('replaceDoc resets history and selection', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  store.setSelection([id]);
  store.replaceDoc(newDoc());
  assert.ok(!store.canUndo());
  assert.ok(!store.canRedo());
  assert.equal(store.selection.size, 0);
});
