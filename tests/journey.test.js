import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';
import {
  addStep, updateStep, removeStep, moveStep, easeInOutCubic, tweenView,
} from '../src/journey.js';
import { initI18n, setLang } from '../src/i18n.js';

const view = (cx, cy, zoom = 1) => ({ cx, cy, zoom });

test('addStep appends a step with copied center view, default label and empty caption', () => {
  const store = new Store();
  const v = view(10, 20, 2);
  const id = addStep(store, v);
  v.cx = 999;
  const step = store.doc.journey[0];
  assert.equal(step.id, id);
  assert.equal(step.label, 'Step 1');
  assert.equal(step.caption, '');
  assert.deepEqual(step.view, { cx: 10, cy: 20, zoom: 2 });
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey[1].label, 'Step 2');
});

test('the default step label follows the interface language', () => {
  initI18n({ storage: null });
  setLang('zh');
  try {
    const store = new Store();
    addStep(store, view(0, 0));
    assert.equal(store.doc.journey[0].label, '步骤 1');
  } finally {
    setLang('en');
  }
  const store = new Store();
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey[0].label, 'Step 1');
});

test('updateStep changes label, caption, and view independently', () => {
  const store = new Store();
  const id = addStep(store, view(0, 0));
  updateStep(store, id, { label: 'Intro', caption: 'Hello' });
  assert.equal(store.doc.journey[0].label, 'Intro');
  assert.equal(store.doc.journey[0].caption, 'Hello');
  updateStep(store, id, { view: view(5, 6, 0.5) });
  assert.deepEqual(store.doc.journey[0].view, { cx: 5, cy: 6, zoom: 0.5 });
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

test('tweenView interpolates screen views and clamps t', () => {
  const from = { x: 0, y: 0, zoom: 1 };
  const to = { x: 100, y: 200, zoom: 3 };
  assert.deepEqual(tweenView(from, to, 0), from);
  assert.deepEqual(tweenView(from, to, 1), to);
  const mid = tweenView(from, to, 0.5);
  assert.equal(mid.x, 50);
  assert.equal(mid.y, 100);
  assert.deepEqual(tweenView(from, to, -5), from);
  assert.deepEqual(tweenView(from, to, 5), to);
});

test('linked steps follow moved parts and exact wire endpoints, round-trip, and fall back when deleted', async () => {
  const { resolveStep, selectedTargets } = await import('../src/journey.js');
  const { serialize, deserialize } = await import('../src/serialize.js');
  const store = new Store();
  store.doc.nodes = [{ id: 'a', kind: 'mcu', label: 'A', x: 0, y: 0 }, { id: 'b', kind: 'temp', label: 'B', x: 400, y: 0 }];
  store.doc.wires = [{ id: 'w', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'b', port: 'i2c' } }];
  const id = addStep(store, view(10, 20));
  updateStep(store, id, { targets: selectedTargets(store.doc, new Set(['w'])) });
  const step = store.doc.journey[0];
  assert.deepEqual([...resolveStep(store.doc, step).ids].sort(), ['a', 'b', 'w']);
  const first = resolveStep(store.doc, step).view;
  store.doc.nodes[1].x += 500;
  assert.ok(resolveStep(store.doc, step).view.cx > first.cx);
  const restored = deserialize(serialize(store.doc)).doc;
  assert.deepEqual(restored.journey[0].targets, step.targets);
  store.doc.wires = [];
  assert.deepEqual(resolveStep(store.doc, step).view, step.view);
  assert.equal(resolveStep(store.doc, step).missing, 1);
  updateStep(store, id, { targets: null });
  assert.equal(store.doc.journey[0].targets, undefined);
  store.undo();
  assert.deepEqual(store.doc.journey[0].targets, { nodes: [], wires: ['w'] });
});

test('zone targets frame the full visual extent and stay out of the highlight set', async () => {
  const { resolveStep } = await import('../src/journey.js');
  const { zoneRect, nodeRect } = await import('../src/geometry.js');
  const doc = {
    nodes: [{ id: 'a', kind: 'mcu', label: 'A', x: 40, y: 40 }],
    wires: [],
    zones: [{ id: 'z', x: 0, y: 0, w: 320, h: 120, label: 'A caption long enough to wrap onto several lines above the zone edge', color: '#4a90d9' }],
  };
  const step = { view: view(0, 0), targets: { nodes: ['a'], zones: ['z', 'gone'] } };
  const rect = zoneRect(doc.zones[0]);
  assert.ok(rect.y < doc.zones[0].y, 'a wrapped caption rises above the zone top edge');
  const resolved = resolveStep(doc, step);
  assert.equal(resolved.missing, 1, 'a deleted zone stays an explicit missing target');
  assert.deepEqual([...resolved.ids], ['a'], 'zone targets frame but never enter the highlight ids');
  const nr = nodeRect(doc.nodes[0]);
  const top = Math.min(rect.y, nr.y);
  const h = Math.max(rect.y + rect.h, nr.y + nr.h) - top;
  assert.ok(Math.abs(resolved.view.cy - h / 2 - top) < 0.5, 'the camera rises to include the caption');
});

test('selectedTargets captures explicitly selected zones and old shapes keep no zones key', async () => {
  const { selectedTargets, normalizeTargets } = await import('../src/journey.js');
  const doc = { nodes: [{ id: 'a' }], wires: [], zones: [{ id: 'z' }] };
  assert.deepEqual(selectedTargets(doc, new Set(['a', 'z'])), { nodes: ['a'], wires: [], zones: ['z'] });
  assert.deepEqual(selectedTargets(doc, new Set(['a'])), { nodes: ['a'], wires: [] });
  assert.deepEqual(normalizeTargets({ zones: ['z', 'z', ''] }), { nodes: [], wires: [], zones: ['z'] });
  assert.equal(normalizeTargets({ zones: [] }), null);
  assert.equal(normalizeTargets({ zones: 5 }), null);
});

test('zone targets survive serialize round-trip and node-only chapters keep their exact shape', async () => {
  const { serialize, deserialize } = await import('../src/serialize.js');
  const store = new Store();
  store.doc.nodes = [{ id: 'a', kind: 'mcu', label: 'A', x: 0, y: 0 }];
  store.doc.zones = [{ id: 'z', x: 0, y: 0, w: 100, h: 80, label: 'Zone', color: '#4a90d9' }];
  const zoned = addStep(store, view(10, 20));
  updateStep(store, zoned, { targets: { nodes: ['a'], zones: ['z'] } });
  assert.deepEqual(store.doc.journey[0].targets, { nodes: ['a'], wires: [], zones: ['z'] });
  const nodeOnly = addStep(store, view(0, 0));
  updateStep(store, nodeOnly, { targets: { nodes: ['a'] } });
  const restored = deserialize(serialize(store.doc)).doc;
  assert.deepEqual(restored.journey[0].targets, { nodes: ['a'], wires: [], zones: ['z'] });
  assert.deepEqual(restored.journey[1].targets, { nodes: ['a'], wires: [] });
});

test('stop-level views stay local to the node and its wires when the chapter targets zones', async () => {
  const { resolveStoryStop } = await import('../src/journey.js');
  const { nodeRect, zoneRect } = await import('../src/geometry.js');
  const doc = {
    nodes: [{ id: 'a', kind: 'mcu', label: 'A', x: 0, y: 0 }, { id: 'b', kind: 'temp', label: 'B', x: 500, y: 0 }],
    wires: [],
    zones: [{ id: 'z', x: 0, y: -800, w: 1200, h: 1800, label: 'Huge', color: '#4a90d9' }],
  };
  const step = { view: view(0, 0), targets: { nodes: ['a'], zones: ['z'] }, stops: [{ node: 'a' }, { node: 'b' }] };
  const stop0 = resolveStoryStop(doc, step, 0);
  assert.deepEqual([...stop0.ids], ['a']);
  const nr = nodeRect(doc.nodes[0]);
  assert.ok(Math.abs(stop0.view.cy - (nr.y + nr.h / 2)) < 0.5, 'the stop camera stays local to the node');
  const overview = resolveStoryStop(doc, step, -1);
  const zr = zoneRect(doc.zones[0]);
  assert.ok(zr.y < doc.zones[0].y, 'the caption extent rises above the zone rectangle');
  const top = Math.min(zr.y, nr.y);
  const bottom = Math.max(zr.y + zr.h, nr.y + nr.h);
  assert.ok(Math.abs(overview.view.cy - (bottom - top) / 2 - top) < 0.5, 'the chapter overview still frames the zone caption extent');
});

test('ordered stops round-trip with stable IDs, clamp hostile input, and remain undoable', async () => {
  const { normalizeStops, addStops, resolveStoryStop } = await import('../src/journey.js');
  const { serialize, deserialize } = await import('../src/serialize.js');
  const store = new Store();
  store.doc.nodes = [{id:'a',kind:'mcu',label:'A',x:0,y:0}, {id:'b',kind:'temp',label:'B',x:400,y:0}];
  const id = addStep(store, view(10, 20));
  addStops(store, id, new Set(['b', 'a', 'missing']));
  const step = store.doc.journey[0];
  assert.deepEqual(step.stops.map(s => s.node), ['b','a']);
  assert.deepEqual(deserialize(serialize(store.doc)).doc.journey[0].stops, step.stops);
  assert.deepEqual([...resolveStoryStop(store.doc, step, 0).ids], ['b']);
  assert.deepEqual(normalizeStops([{id:'x',node:'a',caption:'a'.repeat(5000)},{id:'x',node:'b'},null]).map(s=>s.caption.length), [4000]);
  store.doc.nodes = [];
  assert.equal(resolveStoryStop(store.doc, step, 0).missing, 1);
  assert.deepEqual(resolveStoryStop(store.doc, step, 0).view, step.view);
  store.undo(); assert.equal(store.doc.journey[0].stops, undefined);
});
test('story navigation visits overviews and all stops in both directions', async () => {
  const { nextStoryPosition } = await import('../src/journey.js');
  const steps = [{stops:[{},{}]}, {}, {stops:[{}]}];
  assert.deepEqual(nextStoryPosition(steps,0,-1,1),{chapter:0,stop:0});
  assert.deepEqual(nextStoryPosition(steps,0,1,1),{chapter:1,stop:-1});
  assert.deepEqual(nextStoryPosition(steps,1,-1,-1),{chapter:0,stop:1});
  assert.equal(nextStoryPosition(steps,0,-1,-1),null);
  assert.equal(nextStoryPosition(steps,2,0,1),null);
});

test('story relationships highlight only direct wires and preserve authored direction', async () => {
  const { storyRelationship, storyRelationshipText, resolveStoryStop } = await import('../src/journey.js');
  const doc = {nodes:['a','b','c'].map((id,i)=>({id,kind:'mcu',label:id,x:i*300,y:0})), wires:[
    {id:'ab',bus:'i2c',from:{node:'a',port:'i2c'},to:{node:'b',port:'i2c'}},
    {id:'ab2',bus:'uart',arrow:'both',from:{node:'a',port:'uart'},to:{node:'b',port:'uart'}},
    {id:'bc',bus:'gpio',arrow:'fwd',from:{node:'b',port:'gpio'},to:{node:'c',port:'gpio'}}]};
  const step = {view:view(0,0),stops:[{node:'b'},{node:'a'},{node:'c'}]};
  assert.equal(storyRelationship(doc,step,0).kind,'start');
  assert.deepEqual(storyRelationship(doc,step,1).wires.map(w=>w.id),['ab','ab2']);
  assert.equal(storyRelationship(doc,step,2).kind,'unconnected');
  assert.match(storyRelationshipText(doc,step,1), /a · i2c — b · i2c.*Direction unspecified/);
  assert.match(storyRelationshipText(doc,step,1), /a · uart ↔ b · uart.*Bidirectional arrow/);
  assert.deepEqual([...resolveStoryStop(doc,step,1).ids].sort(),['a','ab','ab2','b']);
  assert.deepEqual([...resolveStoryStop(doc,step,2).ids],['c']);
  const reverse = {...step,stops:[{node:'c'},{node:'b'}]};
  assert.match(storyRelationshipText(doc,reverse,1), /b · gpio → c · gpio/);
});

test('story explanations retain reverse arrows regardless of stop order or language', async () => {
  const { storyRelationshipText } = await import('../src/journey.js');
  const { setLang } = await import('../src/i18n.js');
  const doc = { nodes: [{ id: 'a', label: 'Source' }, { id: 'b', label: 'Sink' }], wires: [
    { id: 'w', bus: 'uart', arrow: 'back', from: { node: 'a', port: 'uart' }, to: { node: 'b', port: 'uart' } },
  ] };
  for (const order of [['a', 'b'], ['b', 'a']]) {
    const step = { stops: order.map(node => ({ node })) };
    assert.equal(storyRelationshipText(doc, step, 1), 'Source · uart ← Sink · uart · UART · Authored arrow direction');
  }
  setLang('zh');
  try {
    assert.match(storyRelationshipText(doc, { stops: [{ node: 'a' }, { node: 'b' }] }, 1), /Source · uart ← Sink · uart/);
    assert.doesNotMatch(storyRelationshipText(doc, { stops: [{ node: 'a' }, { node: 'b' }] }, 1), /方向未指定/);
  } finally { setLang('en'); }
});

test('story moment links survive reordering and fall back for removed stops', async () => {
  const { readStoryMoment } = await import('../src/journey.js');
  const steps = [{id:'other'}, {id:'chapter',stops:[{id:'b'},{id:'a'}]}];
  assert.deepEqual(readStoryMoment(steps,new URLSearchParams('step=chapter&stop=a')),{chapter:1,stop:1});
  assert.deepEqual(readStoryMoment(steps,new URLSearchParams('step=chapter&stop=removed')),{chapter:1,stop:-1});
  assert.equal(readStoryMoment(steps,new URLSearchParams('step=missing')),null);
});
