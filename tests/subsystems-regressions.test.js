import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire } from '../src/state.js';
import { groupSubsystem, createSubsystemNavigation } from '../src/subsystems.js';
import { serialize, deserialize } from '../src/serialize.js';
import { scopeDoc } from '../src/workflows.js';

test('grouping in an expanded subsystem cannot create a board beyond the loader depth limit', () => {
  const store = new Store();
  const navigation = createSubsystemNavigation(store);
  addNode(store, 'generic', 0, 0);
  for (let level = 0; level < 8; level++) {
    const id = navigation.group(store.doc.nodes.map(n => n.id), `Level ${level}`);
    navigation.enter(id);
  }
  const before = serialize(navigation.rootDoc());
  assert.throws(() => navigation.group(store.doc.nodes.map(n => n.id), 'Too deep'), /eight levels/);
  assert.equal(serialize(navigation.rootDoc()), before);
  assert.doesNotThrow(() => deserialize(before));
  navigation.up();
  store.undo();
  assert.doesNotThrow(() => navigation.group(store.doc.nodes.map(n => n.id), 'Replacement level'));
  assert.doesNotThrow(() => deserialize(serialize(navigation.rootDoc())));
});

test('grouping rebases saved view scopes without changing the viewed selection or camera', () => {
  const store = new Store();
  const node = addNode(store, 'generic', 0, 0);
  const inner = groupSubsystem(store, [node], 'Inner');
  const camera = { x: 12, y: 34, zoom: 1.2 };
  store.doc.engineering = { savedViews: [{ id: 'view', scope: [inner], selection: [node], camera }] };
  const outer = groupSubsystem(store, [inner], 'Outer');
  const view = store.doc.engineering.savedViews[0];
  assert.deepEqual(view.scope, [outer, inner]);
  assert.deepEqual(view.selection, [node]);
  assert.deepEqual(view.camera, camera);
  assert.equal(scopeDoc(store.doc, view.scope).nodes[0].id, node);
  store.undo();
  assert.deepEqual(store.doc.engineering.savedViews[0].scope, [inner]);
  store.redo();
  assert.deepEqual(store.doc.engineering.savedViews[0].scope, [outer, inner]);
});

test('saved root views follow regrouping inside expanded scopes, including child undo and return', () => {
  const store = new Store();
  const node = addNode(store, 'generic', 0, 0);
  const inner = groupSubsystem(store, [node], 'Inner');
  const outer = groupSubsystem(store, [inner], 'Outer');
  store.doc.engineering = { savedViews: [{ id: 'view', scope: [outer, inner], selection: [node] }] };
  const navigation = createSubsystemNavigation(store);
  navigation.enter(outer);
  const middle = navigation.group([inner], 'Middle');
  assert.deepEqual(navigation.rootDoc().engineering.savedViews[0].scope, [outer, middle, inner]);
  store.undo();
  assert.deepEqual(navigation.rootDoc().engineering.savedViews[0].scope, [outer, inner]);
  store.redo();
  navigation.up();
  const view = store.doc.engineering.savedViews[0];
  assert.deepEqual(view.scope, [outer, middle, inner]);
  assert.equal(scopeDoc(store.doc, view.scope).nodes[0].id, node);
  store.undo();
  assert.deepEqual(store.doc.engineering.savedViews[0].scope, [outer, inner]);
});

test('saved selections of grouped parts and internal wires follow the wrapper at the root scope', () => {
  const store = new Store();
  const a = addNode(store, 'generic', 0, 0), b = addNode(store, 'generic', 200, 0);
  const wire = addWire(store, 'gpio', { node: a, port: 'p1' }, { node: b, port: 'p2' });
  store.doc.engineering = { savedViews: [{ id: 'view', scope: [], selection: [a, b, wire] }] };
  const wrapper = groupSubsystem(store, [a, b], 'Grouped');
  assert.deepEqual(store.doc.engineering.savedViews[0].selection, [wrapper]);
  store.undo();
  assert.deepEqual(store.doc.engineering.savedViews[0].selection, [a, b, wire]);
  store.redo();
  assert.deepEqual(store.doc.engineering.savedViews[0].selection, [wrapper]);
});

test('ancestor-owned saved selections follow grouping in their expanded scope through undo and return', () => {
  const store = new Store();
  const a = addNode(store, 'generic', 0, 0), b = addNode(store, 'generic', 200, 0);
  const wire = addWire(store, 'gpio', { node: a, port: 'p1' }, { node: b, port: 'p2' });
  const outer = groupSubsystem(store, [a, b], 'Outer');
  store.doc.engineering = { savedViews: [{ id: 'view', scope: [outer], selection: [a, b, wire] }] };
  const navigation = createSubsystemNavigation(store);
  navigation.enter(outer);
  const middle = navigation.group([a, b], 'Middle');
  const view = () => navigation.rootDoc().engineering.savedViews[0];
  assert.deepEqual(view().scope, [outer]);
  assert.deepEqual(view().selection, [middle]);
  store.undo();
  assert.deepEqual(view().selection, [a, b, wire]);
  store.redo();
  const nested = navigation.group([middle], 'Nested');
  assert.deepEqual(view().selection, [nested]);
  navigation.up();
  assert.deepEqual(view().selection, [nested]);
  store.undo();
  assert.deepEqual(view().selection, [a, b, wire]);
  store.redo();
  assert.deepEqual(view().selection, [nested]);
});

test('regrouped saved views stay in the intended scope when reusable subsystems share local IDs', () => {
  const store = new Store();
  const leaf = addNode(store, 'generic', 0, 0);
  const original = groupSubsystem(store, [leaf], 'Original');
  const reused = structuredClone(store.doc.nodes[0]);
  reused.id = 'reused';
  store.doc.nodes.push(reused);
  store.doc.engineering = { savedViews: [{ id: 'view', scope: [original], selection: [leaf] }] };
  const wrapper = groupSubsystem(store, [original], 'Wrapper');
  const view = store.doc.engineering.savedViews[0];
  assert.deepEqual(view.scope, [wrapper, original]);
  assert.deepEqual(view.selection, [leaf]);
  assert.equal(scopeDoc(store.doc, view.scope).nodes[0].id, leaf);
  assert.doesNotThrow(() => deserialize(serialize(store.doc)));
});
