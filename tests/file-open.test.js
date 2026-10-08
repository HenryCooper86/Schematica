import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { initDialogs } from '../src/ui/dialogs.js';

function setup(t) {
  const original = globalThis.document;
  const elements = new Map();
  globalThis.document = {
    querySelectorAll: () => [],
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        value: '', files: [], textContent: '',
        classList: { add() {}, remove() {} },
        addEventListener(event, handler) { this[event] = handler; },
      });
      return elements.get(id);
    },
  };
  t.after(() => { globalThis.document = original; });
  const store = new Store(newDoc('Current'));
  initDialogs({ store });
  const input = elements.get('file-input');
  const start = title => {
    let resolve, reject;
    input.files = [{ size: 100, text: () => new Promise((done, fail) => { resolve = done; reject = fail; }) }];
    const finished = input.change();
    return { finished, finish: () => resolve(JSON.stringify(newDoc(title))), fail: () => reject(new Error('File read failed')) };
  };
  return { store, start, input, elements };
}

test('opening an unchanged board file replaces the board after the read completes', async t => {
  const { store, start } = setup(t);
  const read = start('Opened');
  assert.equal(store.doc.title, 'Current');
  read.finish();
  await read.finished;
  assert.equal(store.doc.title, 'Opened');
});

test('a pending board file read preserves newer local edits and their history', async t => {
  const { store, start } = setup(t);
  const read = start('Opened');
  store.apply(doc => { doc.title = 'Newer edit'; });
  read.finish();
  await read.finished;
  assert.equal(store.doc.title, 'Newer edit');
  assert.equal(store.undoStack.length, 1);
});

test('an older board file read cannot replace a newer requested file', async t => {
  const { store, start } = setup(t);
  const old = start('Older request');
  const next = start('Latest request');
  old.finish();
  await old.finished;
  assert.equal(store.doc.title, 'Current');
  next.finish();
  await next.finished;
  assert.equal(store.doc.title, 'Latest request');
});

test('a pending board file read cannot replace a different board', async t => {
  const { store, start } = setup(t);
  const read = start('Opened');
  store.replaceDoc(newDoc('Replacement'));
  read.finish();
  await read.finished;
  assert.equal(store.doc.title, 'Replacement');
});

test('a pending board file read leaves an active drag intact before its first movement', async t => {
  const { store, start } = setup(t);
  const read = start('Opened');
  store.beginDrag();
  read.finish();
  await read.finished;
  assert.equal(store.doc.title, 'Current');
  assert.equal(store.inBatch(), true);
});

test('opening a file during an existing drag does not read or replace the board', async t => {
  const { store, input } = setup(t);
  let reads = 0;
  store.beginDrag();
  input.files = [{ size: 100, text: async () => { reads++; return JSON.stringify(newDoc('Opened')); } }];
  await input.change();
  assert.equal(reads, 0);
  assert.equal(store.doc.title, 'Current');
  assert.equal(store.inBatch(), true);
});

test('a failed newer file request keeps the current board instead of opening an obsolete file', async t => {
  const { store, start, elements } = setup(t);
  const old = start('Obsolete request'), latest = start('Latest request');
  latest.fail();
  await latest.finished;
  old.finish();
  await old.finished;
  assert.equal(store.doc.title, 'Current');
  assert.equal(elements.get('toast').textContent, 'File read failed');
});
