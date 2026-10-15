import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire, updateItem, newDoc } from '../src/state.js';
import { createClipboardCommands } from '../src/ui/clipboard-commands.js';

function pendingCut() {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.setSelection([a, b]);
  let finish, copied;
  const notices = [];
  const commands = createClipboardCommands({
    store, canEditNow: () => !store.inBatch(), notify: message => notices.push(message),
    clipboard: () => ({ writeText: text => {
      copied = JSON.parse(text);
      return new Promise(resolve => { finish = resolve; });
    } }),
  });
  const done = commands.copySelection({ cut: true });
  return { store, a, b, commands, notices, copied, done, finish };
}

test('a delayed cut preserves edits made after its clipboard snapshot', async () => {
  const { store, a, copied, done, finish, notices } = pendingCut();
  updateItem(store, a, { label: 'Newer edit' });
  const before = structuredClone(store.doc), undoDepth = store.undoStack.length;
  finish();
  await done;
  assert.equal(copied.nodes[0].label, 'MCU');
  assert.deepEqual(store.doc, before);
  assert.equal(store.undoStack.length, undoDepth);
  assert.match(notices.at(-1), /copied/);
});

test('an unchanged delayed cut removes its original selection in one undo step', async () => {
  const { store, b, done, finish } = pendingCut();
  const before = structuredClone(store.doc), undoDepth = store.undoStack.length;
  store.setSelection([b]);
  finish();
  await done;
  assert.equal(store.doc.nodes.length, 0);
  assert.equal(store.doc.wires.length, 0);
  assert.equal(store.undoStack.length, undoDepth + 1);
  store.undo();
  assert.deepEqual(store.doc, before);
});

test('a delayed cut cannot remove items from a replacement board', async () => {
  const { store, done, finish } = pendingCut();
  store.replaceDoc(newDoc('Replacement'));
  const before = structuredClone(store.doc);
  finish();
  await done;
  assert.deepEqual(store.doc, before);
  assert.equal(store.undoStack.length, 0);
});

test('an oversized cut leaves the board and the previous in-tab copy intact', async () => {
  const store = new Store();
  store.doc.notes.push({ id: 'small', x: 0, y: 0, text: 'Keep this copy' });
  const notices = [];
  let writes = 0;
  const commands = createClipboardCommands({
    store, canEditNow: () => true, notify: message => notices.push(message),
    clipboard: () => ({ writeText: async () => { writes += 1; } }),
  });
  store.setSelection(['small']);
  await commands.copySelection();
  store.doc.notes = Array.from({ length: 201 }, (_, i) => ({
    id: `large${i}`, x: i * 8, y: 0, text: 'x'.repeat(20_000),
  }));
  store.setSelection(store.doc.notes.map(note => note.id));
  const before = structuredClone(store.doc), undoDepth = store.undoStack.length;
  await commands.copySelection({ cut: true });
  assert.deepEqual(store.doc, before);
  assert.equal(store.undoStack.length, undoDepth);
  assert.equal(writes, 1, 'an unpasteable payload must not replace the system clipboard');
  assert.match(notices.at(-1), /too large/i);
  await commands.pasteClipboard();
  assert.equal(store.doc.notes.at(-1).text, 'Keep this copy');
});

test('cut leaves a separately selected wire that was not copied', async () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const wire = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.doc.notes.push({ id: 'note', x: 0, y: 300, text: 'Cut me' });
  store.setSelection(['note', wire]);
  let copied;
  const commands = createClipboardCommands({
    store, canEditNow: () => true, notify: () => {},
    clipboard: () => ({ writeText: async text => { copied = JSON.parse(text); } }),
  });
  const before = structuredClone(store.doc);
  await commands.copySelection({ cut: true });
  assert.equal(copied.wires.length, 0);
  assert.equal(store.doc.notes.length, 0);
  assert.deepEqual(store.doc.wires, before.wires, 'cut removes only items represented by the payload');
  assert.deepEqual([...store.selection], [wire]);
  store.undo();
  assert.deepEqual(store.doc, before);
});
