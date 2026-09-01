import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';
import {
  addStep, updateStep, removeStep, moveStep, easeInOutCubic, tweenView,
} from '../src/journey.js';

const view = (x, y, zoom = 1) => ({ x, y, zoom });

test('addStep appends a step with copied view, default label and empty caption', () => {
  const store = new Store();
  const v = view(10, 20, 2);
  const id = addStep(store, v);
  v.x = 999;
  const step = store.doc.journey[0];
  assert.equal(step.id, id);
  assert.equal(step.label, 'Step 1');
  assert.equal(step.caption, '');
  assert.deepEqual(step.view, { x: 10, y: 20, zoom: 2 });
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey[1].label, 'Step 2');
});

test('updateStep changes label, caption, and view independently', () => {
  const store = new Store();
  const id = addStep(store, view(0, 0));
  updateStep(store, id, { label: 'Intro', caption: 'Hello' });
  assert.equal(store.doc.journey[0].label, 'Intro');
  assert.equal(store.doc.journey[0].caption, 'Hello');
  updateStep(store, id, { view: view(5, 6, 0.5) });
  assert.deepEqual(store.doc.journey[0].view, { x: 5, y: 6, zoom: 0.5 });
  assert.equal(store.doc.journey[0].label, 'Intro');
});

test('removeStep and moveStep reorder correctly; out-of-range move is a no-op', () => {
  const store = new Store();
  const a = addStep(store, view(1, 1));
  const b = addStep(store, view(2, 2));
  const c = addStep(store, view(3, 3));
  moveStep(store, c, -1);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, c, b]);
  moveStep(store, a, -1);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, c, b]);
  removeStep(store, c);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, b]);
});

test('journey edits are undoable', () => {
  const store = new Store();
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey.length, 1);
  store.undo();
  assert.equal(store.doc.journey.length, 0);
  store.redo();
  assert.equal(store.doc.journey.length, 1);
});

test('easeInOutCubic endpoints and monotonicity', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = easeInOutCubic(t);
    assert.ok(v >= prev, `not monotonic at ${t}`);
    prev = v;
  }
});

test('tweenView interpolates and clamps t', () => {
  const from = view(0, 0, 1);
  const to = view(100, 200, 3);
  assert.deepEqual(tweenView(from, to, 0), from);
  assert.deepEqual(tweenView(from, to, 1), to);
  const mid = tweenView(from, to, 0.5);
  assert.ok(Math.abs(mid.x - 50) < 1e9 && mid.x > 0 && mid.x < 100);
  assert.deepEqual(tweenView(from, to, -5), from);
  assert.deepEqual(tweenView(from, to, 5), to);
});
