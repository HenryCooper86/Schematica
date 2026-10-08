import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagramScene } from '../src/render.js';
import { Store, addNode, addWire, addZone, addNote } from '../src/state.js';

test('selection redraws only changed items using the existing geometry scene', () => {
  const store = new Store();
  const a = addNode(store, 'generic', 0, 0), b = addNode(store, 'generic', 400, 0);
  const wire = addWire(store, 'gpio', { node: a, port: 'right' }, { node: b, port: 'left' });
  const zone = addZone(store, { x: 0, y: 200, w: 500, h: 200 });
  const note = addNote(store, 600, 0, 'A note');
  const scene = createDiagramScene();
  scene.render(store.doc, { selection: new Set() });
  // Reading the untouched card would mean rebuilding the document's scene.
  const originalX = store.doc.nodes[1].x;
  Object.defineProperty(store.doc.nodes[1], 'x', { configurable: true, get() { throw Error('Untouched geometry was recomputed'); } });
  const selected = scene.select(store.doc, { selection: new Set([a, wire, zone, note]) });
  assert.deepEqual(selected.nodes.map(([id]) => id), [a]);
  assert.deepEqual(selected.wires.map(([id]) => id), [wire]);
  assert.match(selected.wires[0][1], /data-wend="from"/);
  assert.match(selected.zones[0][1], /data-zhandle="nw"/);
  assert.match(selected.notes[0][1], /stroke-width="2"/);
  Object.defineProperty(store.doc.nodes[1], 'x', { configurable: true, writable: true, value: originalX });
  const cleared = scene.select(store.doc, { selection: new Set() });
  assert.equal(cleared.nodes.length, 1);
  assert.doesNotMatch(cleared.wires[0][1], /data-wend=/);
  assert.doesNotMatch(cleared.zones[0][1], /data-zhandle=/);
  assert.deepEqual(scene.select(store.doc, { selection: new Set() }), { zones: [], wires: [], nodes: [], notes: [] });
  store.doc.nodes[0].x = 100;
  scene.render(store.doc, { selection: new Set() });
  const moved = scene.select(store.doc, { selection: new Set([a]) });
  assert.match(moved.nodes[0][1], /translate\(100 0\)/);
});
