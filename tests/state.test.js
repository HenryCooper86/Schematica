import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uid, newDoc, Store, addNode, addWire, addZone, addSwimlane, addNote,
  findItem, updateItem, deleteItems, duplicateItems, SCHEMA_VERSION,
  isLocked, nextLockState, setLock, lockedKeptMessage,
} from '../src/state.js';
import { initI18n, setLang } from '../src/i18n.js';

test('uid is unique and prefixed', () => {
  const a = uid('n');
  const b = uid('n');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('n'));
});

test('uid bodies are random, not a clock plus a per-page counter', () => {
  // Two tabs (or two peers) minting ids in the same millisecond must not
  // collide, so the body carries ~62 bits of randomness and nothing else.
  const ids = new Set();
  for (let i = 0; i < 5000; i++) {
    const id = uid('w');
    assert.match(id, /^w[0-9a-z]{12}$/, id);
    ids.add(id);
  }
  assert.equal(ids.size, 5000);
});

test('isDragging is true only between beginDrag and endDrag or cancelDrag', () => {
  const store = new Store();
  assert.equal(store.isDragging(), false);
  store.beginDrag();
  assert.equal(store.isDragging(), true);
  store.endDrag();
  assert.equal(store.isDragging(), false);
  store.beginDrag();
  store.cancelDrag();
  assert.equal(store.isDragging(), false);
});

test('newDoc shape', () => {
  const doc = newDoc('X');
  assert.deepEqual(doc, { schema: SCHEMA_VERSION, title: 'X', nodes: [], wires: [], zones: [], notes: [], journey: [] });
});

test('addNode uses part defaults', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 100, 50);
  const node = store.doc.nodes[0];
  assert.equal(node.id, id);
  assert.equal(node.kind, 'mcu');
  assert.equal('w' in node, false, 'cards size to their content; nothing is stored');
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

test('updateItem removes a key set to undefined and keeps one set to null', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  updateItem(store, id, { fields: { type: 'insider' }, status: 'todo' });
  const node = () => findItem(store.doc, id).item;
  assert.deepEqual(node().fields, { type: 'insider' });

  // What the properties panel and the inline editor mean by "no key rather
  // than {}": the doc must match what a save and reload would produce.
  updateItem(store, id, { fields: undefined });
  assert.ok(!Object.prototype.hasOwnProperty.call(node(), 'fields'));
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(node()))), Object.keys(node()));

  // null is a value the panel stores to mean "turned off", so it stays.
  updateItem(store, id, { status: null });
  assert.ok(Object.prototype.hasOwnProperty.call(node(), 'status'));
  assert.equal(node().status, null);

  // Clearing a key the item never had is not an error and adds nothing.
  updateItem(store, id, { notes: undefined });
  assert.ok(!Object.prototype.hasOwnProperty.call(node(), 'notes'));
});

test('updateItem clearing a key is undoable', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  updateItem(store, id, { fields: { type: 'insider' } });
  updateItem(store, id, { fields: undefined });
  assert.equal(findItem(store.doc, id).item.fields, undefined);
  store.undo();
  assert.deepEqual(findItem(store.doc, id).item.fields, { type: 'insider' });
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

test('deleteItems keeps locked items and reports how many', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  setLock(store, [a], true);
  const res = deleteItems(store, [a, b]);
  assert.deepEqual(res, { removed: 1, kept: 1 });
  assert.deepEqual(store.doc.nodes.map((n) => n.id), [a]);
  // The wire went with the node that was deleted, not with the one kept.
  assert.equal(findItem(store.doc, w), null);
});

test('deleting only locked items changes nothing and costs no undo step', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  setLock(store, [a], true);
  const depth = store.undoStack.length;
  assert.deepEqual(deleteItems(store, [a]), { removed: 0, kept: 1 });
  assert.equal(store.doc.nodes.length, 1);
  assert.equal(store.undoStack.length, depth);
});

test('a locked node keeps the wires drawn to it when its neighbour goes', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  setLock(store, [a], true);
  deleteItems(store, [a]);
  assert.equal(store.doc.wires.length, 1, 'the wire has both endpoints still');
});

test('setLock stores true and removes the key again, in one undo step', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
  const depth = store.undoStack.length;
  setLock(store, [a, z], true);
  assert.equal(store.undoStack.length, depth + 1, 'a multi-item lock is one step');
  assert.equal(findItem(store.doc, a).item.locked, true);
  assert.equal(findItem(store.doc, z).item.locked, true);
  setLock(store, [a, z], false);
  assert.equal(JSON.stringify(store.doc).includes('locked'), false, 'false is an absent key');
  store.undo();
  assert.equal(isLocked(findItem(store.doc, a).item), true, 'undo brings the lock back');
});

test('setLock ignores wires, which have no lock', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  setLock(store, [w], true);
  assert.equal(findItem(store.doc, w).item.locked, undefined);
});

test('nextLockState locks while anything is open and unlocks once all are locked', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const t = addNote(store, 10, 10, 'hi');
  assert.equal(nextLockState(store.doc, [a, t]), true);
  setLock(store, [a], true);
  assert.equal(nextLockState(store.doc, [a, t]), true, 'a mixed selection still locks');
  setLock(store, [t], true);
  assert.equal(nextLockState(store.doc, [a, t]), false);
});

test('nextLockState is null when nothing in the selection can be locked', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  assert.equal(nextLockState(store.doc, [w]), null);
  assert.equal(nextLockState(store.doc, []), null);
  assert.equal(nextLockState(store.doc, ['gone']), null);
});

test('lockedKeptMessage counts, and says nothing when nothing was kept', () => {
  assert.equal(lockedKeptMessage(0), null);
  assert.match(lockedKeptMessage(1), /^1 locked item was kept/);
  assert.match(lockedKeptMessage(3), /^3 locked items were kept/);
});

test('duplicateItems carries the lock onto the copy', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  setLock(store, [a], true);
  const [copy] = duplicateItems(store, [a]);
  assert.equal(findItem(store.doc, copy).item.locked, true);
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

test('no-op apply pushes no undo entry and preserves the redo stack', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  assert.equal(store.undoStack.length, 1);
  store.apply(() => {}); // e.g. a blur committing an unedited field
  assert.equal(store.undoStack.length, 1);
  store.undo();
  assert.ok(store.canRedo());
  store.apply(() => {}); // a no-op must not clear redo either
  assert.ok(store.canRedo());
  store.redo();
  assert.equal(store.doc.nodes.length, 1);
});

test('updateItem with unchanged values is not undoable', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  updateItem(store, id, { label: store.doc.nodes[0].label });
  assert.equal(store.undoStack.length, depth);
});

test('rewireEnd moves one end of a wire (optionally changing its bus) and is undoable', async () => {
  const { rewireEnd, addWire } = await import('../src/state.js');
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 400, 0);
  const c = addNode(store, 'imu', 400, 200);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  rewireEnd(store, w, 'to', { node: c, port: 'spi' }, 'spi');
  assert.deepEqual(store.doc.wires[0].to, { node: c, port: 'spi' });
  assert.equal(store.doc.wires[0].bus, 'spi');
  rewireEnd(store, w, 'from', { node: b, port: 'i2c' });
  assert.deepEqual(store.doc.wires[0].from, { node: b, port: 'i2c' });
  assert.equal(store.doc.wires[0].bus, 'spi', 'bus untouched when not given');
  store.undo();
  store.undo();
  assert.deepEqual(store.doc.wires[0].to, { node: b, port: 'i2c' });
  assert.equal(store.doc.wires[0].bus, 'i2c');
});

test('resolveBus adopts an agreed bus, keeps a still-matching one, and asks otherwise', async () => {
  const { resolveBus } = await import('../src/state.js');
  assert.equal(resolveBus('gpio', 'spi', 'spi'), 'spi', 'both ports agree: adopt');
  assert.equal(resolveBus('i2c', 'i2c', 'adc'), 'i2c', 'current bus still matches one end: keep');
  assert.equal(resolveBus('uart', 'i2c', 'adc'), null, 'nothing matches: ask the user');
  assert.equal(resolveBus('i2c', null, 'i2c'), 'i2c', 'an endpoint without a bus does not block');
});

test('addNode uses a part default label when it has one', () => {
  const store = new Store();
  addNode(store, 'startend', 0, 0);
  addNode(store, 'connector', 0, 0);
  addNode(store, 'router', 0, 0);
  assert.deepEqual(store.doc.nodes.map((n) => n.label), ['Start', 'A', 'Router']);
});

test('a batch collapses many mutations into one undo step', () => {
  const store = new Store();
  store.beginBatch();
  store.mutate((doc) => doc.nodes.push({ id: 'a', kind: 'mcu', x: 0, y: 0 }));
  store.mutate((doc) => doc.nodes.push({ id: 'b', kind: 'temp', x: 0, y: 0 }));
  assert.equal(store.inBatch(), true);
  store.endBatch();
  assert.equal(store.inBatch(), false);
  assert.equal(store.undoStack.length, 1);
  store.undo();
  assert.equal(store.doc.nodes.length, 0);
});

test('a nested beginBatch keeps the outer snapshot', () => {
  const store = new Store();
  store.beginBatch();
  store.mutate((doc) => doc.nodes.push({ id: 'a', kind: 'mcu', x: 0, y: 0 }));
  store.beginBatch();
  store.mutate((doc) => doc.nodes.push({ id: 'b', kind: 'temp', x: 0, y: 0 }));
  store.endBatch();
  store.undo();
  assert.equal(store.doc.nodes.length, 0, 'undo returns to before the outer batch');
});

test('apply inside a drag folds into the batch: one undo step, redo stack kept', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  store.apply((doc) => { doc.title = 'renamed'; });
  store.undo();
  assert.equal(store.redoStack.length, 1);
  const depth = store.undoStack.length;
  store.beginDrag();
  store.mutate((doc) => { doc.nodes[0].x = 40; });
  updateItem(store, id, { label: 'Brain' });
  assert.equal(store.undoStack.length, depth, 'apply mid-drag pushes nothing of its own');
  assert.equal(store.redoStack.length, 1, 'apply mid-drag does not clear redo');
  store.endDrag();
  assert.equal(store.undoStack.length, depth + 1, 'the drag is exactly one undo step');
  assert.equal(store.doc.nodes[0].label, 'Brain');
  store.undo();
  assert.equal(store.doc.nodes[0].x, 0, 'one undo reverts both the move and the edit');
  assert.equal(store.doc.nodes[0].label, 'MCU');
});

test('drag helpers are aliases of the batch', () => {
  const store = new Store();
  store.beginDrag();
  assert.equal(store.inBatch(), true);
  assert.equal(store.isDragging(), true);
  store.cancelDrag();
  assert.equal(store.inBatch(), false);
});

test('replaceDoc bumps the generation counter', () => {
  const store = new Store();
  assert.equal(store.generation, 0);
  store.replaceDoc(newDoc('B'));
  assert.equal(store.generation, 1);
  store.apply((doc) => { doc.title = 'edit'; });
  assert.equal(store.generation, 1, 'ordinary edits do not count');
});

test('addNode with a definition makes a custom node labelled by its name', () => {
  const store = new Store();
  const def = { name: 'Motor driver x4', category: 'actuators', ports: [{ name: 'VCC', side: 'top', bus: 'power', required: true }] };
  const id = addNode(store, 'custom', 10, 20, def);
  const node = store.doc.nodes[0];
  assert.equal(node.id, id);
  assert.equal(node.kind, 'custom');
  assert.equal(node.label, 'Motor driver x4');
  assert.equal(node.part.ports[0].id, 'p1', 'the definition is normalized');
  assert.notEqual(node.part, def, 'a copy, not the caller\'s object');
  addNode(store, 'custom', 0, 0, { name: '' });
  assert.equal(store.doc.nodes[1].kind, 'generic', 'an unusable definition falls back to the custom box');
  assert.equal('part' in store.doc.nodes[1], false);
});

test('a part placed in Chinese gets a Chinese default label; in English the English name', () => {
  initI18n({ storage: null });
  const store = new Store(newDoc());
  const en = addNode(store, 'mcu', 0, 0);
  assert.equal(store.doc.nodes.find((n) => n.id === en).label, 'MCU');
  setLang('zh');
  try {
    const cn = addNode(store, 'mcu', 0, 0);
    assert.equal(store.doc.nodes.find((n) => n.id === cn).label, '微控制器');
    const start = addNode(store, 'startend', 0, 0);
    assert.equal(store.doc.nodes.find((n) => n.id === start).label, '开始');
  } finally {
    setLang('en');
  }
});

test('a custom part keeps the name its author typed, whatever the language', () => {
  initI18n({ storage: null });
  const store = new Store(newDoc());
  setLang('zh');
  try {
    // "Battery" is a catalogue name with a Chinese entry: a built-in battery
    // is labelled in Chinese, a custom part called Battery is not.
    const custom = addNode(store, 'custom', 0, 0, { name: 'Battery', category: 'power', ports: [] });
    assert.equal(store.doc.nodes.find((n) => n.id === custom).label, 'Battery');
    const builtin = addNode(store, 'battery', 0, 0);
    assert.equal(store.doc.nodes.find((n) => n.id === builtin).label, '电池');
  } finally {
    setLang('en');
  }
});

test('a new board is titled in the interface language', () => {
  initI18n({ storage: null });
  assert.equal(newDoc().title, 'Untitled Board');
  setLang('zh');
  try {
    assert.equal(newDoc().title, '未命名板图');
  } finally {
    setLang('en');
  }
  assert.equal(newDoc().title, 'Untitled Board');
});

test('zones, swimlanes and notes get language-aware default text', () => {
  initI18n({ storage: null });
  const store = new Store(newDoc());
  setLang('zh');
  try {
    const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
    assert.equal(store.doc.zones.find((x) => x.id === z).label, '区域');
    const s = addSwimlane(store, { x: 0, y: 0, w: 400, h: 300 });
    const lane = store.doc.zones.find((x) => x.id === s);
    assert.equal(lane.label, '处理');
    assert.deepEqual(lane.lanes, ['泳道 1', '泳道 2', '泳道 3']);
    const t = addNote(store, 0, 0);
    assert.equal(store.doc.notes.find((x) => x.id === t).text, '便签');
  } finally {
    setLang('en');
  }
  const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(store.doc.zones.find((x) => x.id === z).label, 'Zone');
});
