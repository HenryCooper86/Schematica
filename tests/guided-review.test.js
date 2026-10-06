import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { EXAMPLES } from '../src/examples.js';
import { createRevisions } from '../src/revisions.js';
import { checkDoc } from '../src/drc.js';
import { firstProjectProgress } from '../src/onboarding-progress.js';
import { loadGuideBoard, walkthroughSession, introduceMismatch } from '../src/guided-review.js';

const uart = () => structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc);
const memoryStorage = () => {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
};

test('guided load persists a recoverable copy before replacing the board', async () => {
  const store = new Store(newDoc('My work'));
  store.doc.notes.push({ id: 'note', x: 1, y: 2, text: 'Keep me' });
  const previous = structuredClone(store.doc);
  const revisions = createRevisions(memoryStorage());
  await loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() });
  assert.equal(store.doc.title, 'Declared UART Interface Reference');
  assert.deepEqual(revisions.restore(revisions.list()[0].id), previous);
  assert.doesNotThrow(() => walkthroughSession(store), 'a serialized/loaded UART board remains the same walkthrough');
});

test('guided load refuses an undurable recovery copy', async () => {
  const store = new Store(newDoc('Keep my title'));
  const revisions = createRevisions({ length: 0, setItem() { throw Error('quota'); } });
  await assert.rejects(loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() }), /Save the current board/);
  assert.equal(store.doc.title, 'Keep my title');
});

test('an edit during revision flush survives, and the saved recovery remains the original snapshot', async () => {
  const store = new Store(newDoc('Before save'));
  const revisions = createRevisions(memoryStorage());
  let release, started;
  const flushing = new Promise(resolve => { started = resolve; });
  revisions.flush = () => { started(); return new Promise(resolve => { release = resolve; }); };
  const pending = loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() });
  await flushing;
  store.apply(doc => { doc.title = 'Edited while flushing'; });
  release();
  await assert.rejects(pending, /board changed/);
  assert.equal(store.doc.title, 'Edited while flushing');
  assert.equal(revisions.restore(revisions.list()[0].id).title, 'Before save');
});

test('guided load rejects a batch active at invocation even if it ends before recovery is ready', async () => {
  const store = new Store(newDoc('Existing project'));
  const revisions = createRevisions(memoryStorage());
  store.beginDrag();
  const pending = loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() });
  store.endDrag();
  await assert.rejects(pending, /board changed/);
  assert.equal(store.doc.title, 'Existing project');
  assert.equal(store.generation, 0);
  assert.equal(store.undoStack.length, 0);
});

for (const boundary of ['ready', 'flush']) {
  test(`an unchanged drag beginning during recovery ${boundary} blocks replacement and retains undo`, async () => {
    const store = new Store(uart());
    store.doc.title = 'Existing project';
    const before = structuredClone(store.doc);
    const revisions = createRevisions(memoryStorage());
    let release, started;
    const reached = new Promise(resolve => { started = resolve; });
    const paused = new Promise(resolve => { release = resolve; });
    if (boundary === 'ready') { revisions.ready = paused; started(); }
    else revisions.flush = () => { started(); return paused; };
    const pending = loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() });
    await reached;
    store.beginDrag();
    assert.deepEqual(store.doc, before, 'the drag has not moved yet');
    release();
    await assert.rejects(pending, /board changed/);
    assert.deepEqual(store.doc, before);
    assert.equal(store.generation, 0);
    assert.equal(store.inBatch(), true, 'loading must not reset the in-flight drag');
    store.mutate(doc => { doc.nodes[0].x += 24; });
    store.endDrag();
    assert.equal(store.undoStack.length, 1, 'the continued drag remains one undo step');
    store.undo();
    assert.deepEqual(store.doc, before);
  });
}

for (const change of ['edit', 'replace', 'same-content replacement']) {
  test(`guided load cannot overwrite ${change} while recovery is pending`, async () => {
    let release;
    const store = new Store(newDoc('Original'));
    const revisions = createRevisions(memoryStorage());
    revisions.ready = new Promise(resolve => { release = resolve; });
    const pending = loadGuideBoard({ store, rootDoc: () => store.doc, revisions, doc: uart() });
    if (change === 'edit') store.apply(doc => { doc.title = 'New work'; });
    else store.replaceDoc(change === 'replace' ? newDoc('New work') : structuredClone(store.doc));
    const current = structuredClone(store.doc);
    release();
    await assert.rejects(pending, /board changed/);
    assert.deepEqual(store.doc, current);
  });
}

test('walkthrough mismatch is a real bandwidth failure; ordinary interface repair and undo recover it', () => {
  const store = new Store(uart());
  const session = walkthroughSession(store);
  assert.equal(firstProjectProgress(store.doc).ready, true);
  introduceMismatch(store, session);
  assert.equal(store.doc.nodes[1].interfacePorts.left.rateBps, 9600);
  assert.ok(checkDoc(store.doc).some(f => f.rule === 'interface-bandwidth' && f.ids[0] === 'w1'));
  assert.equal(firstProjectProgress(store.doc).ready, false);
  // The existing interface editor commits capabilities through Store.apply.
  store.apply(doc => { doc.nodes[1].interfacePorts.left.rateBps = 115200; });
  assert.equal(firstProjectProgress(store.doc).ready, true);
  store.undo();
  assert.equal(firstProjectProgress(store.doc).ready, false);
  store.undo();
  assert.equal(firstProjectProgress(store.doc).ready, true);
});

for (const change of ['edit', 'replace', 'lock']) {
  test(`walkthrough action rejects stale ${change} without adding undo history`, () => {
    const store = new Store(uart());
    const session = walkthroughSession(store);
    if (change === 'replace') store.replaceDoc(uart());
    else store.apply(doc => { if (change === 'lock') doc.nodes[1].locked = true; else doc.title = 'Changed'; });
    const before = structuredClone(store.doc), history = store.undoStack.length;
    assert.throws(() => introduceMismatch(store, session));
    assert.deepEqual(store.doc, before);
    assert.equal(store.undoStack.length, history);
  });
}

test('ordinary boards cannot acquire a UART walkthrough session', () => {
  assert.throws(() => walkthroughSession(new Store(newDoc())));
});
