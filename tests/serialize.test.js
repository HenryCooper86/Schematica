import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize } from '../src/serialize.js';
import { Store, addNode, addWire, addZone, addNote } from '../src/state.js';

function sampleDoc() {
  const store = new Store();
  const a = addNode(store, 'mcu', 100, 100);
  const b = addNode(store, 'temp', 400, 100);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  addZone(store, { x: 50, y: 50, w: 500, h: 300 }, 'Board');
  addNote(store, 600, 50, 'remember decoupling caps');
  return store.doc;
}

test('round trip preserves the document', () => {
  const doc = sampleDoc();
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(back, doc);
  assert.deepEqual(warnings, []);
});

test('invalid JSON throws readable error', () => {
  assert.throws(() => deserialize('{nope'), /could not parse JSON/);
});

test('non-object top level throws', () => {
  assert.throws(() => deserialize('[1,2]'), /must be an object/);
  assert.throws(() => deserialize('"hi"'), /must be an object/);
});

test('non-array collection throws', () => {
  assert.throws(() => deserialize('{"nodes": 5}'), /"nodes" must be an array/);
});

test('missing collections default to empty; bad title falls back', () => {
  const { doc } = deserialize('{"schema": 1, "title": 7}');
  assert.equal(doc.title, 'Untitled Board');
  assert.deepEqual(doc.nodes, []);
  assert.deepEqual(doc.wires, []);
});

test('newer schema warns but loads', () => {
  const { warnings } = deserialize('{"schema": 99}');
  assert.ok(warnings.some((w) => w.includes('newer')));
});

test('unknown kind falls back to generic, keeps label and position', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 1,
    nodes: [{ id: 'n1', kind: 'quantum-cpu', x: 10, y: 20, label: 'QPU' }],
  }));
  assert.equal(doc.nodes[0].kind, 'generic');
  assert.equal(doc.nodes[0].label, 'QPU');
  assert.equal(doc.nodes[0].x, 10);
  assert.ok(warnings.length === 1);
});

test('node missing position is dropped with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu' }],
  }));
  assert.equal(doc.nodes.length, 0);
  assert.equal(warnings.length, 1);
});

test('duplicate ids are dropped', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n1', kind: 'temp', x: 100, y: 0 },
    ],
  }));
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.nodes[0].kind, 'mcu');
  assert.equal(warnings.length, 1);
});

test('dangling wire is dropped with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0 }],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'ghost', port: 'i2c' } },
      { id: 'w2', bus: 'i2c', from: { node: 'n1', port: 'no-such-port' }, to: { node: 'n1', port: 'i2c' } },
    ],
  }));
  assert.equal(doc.wires.length, 0);
  assert.equal(warnings.length, 2);
});

test('unknown bus falls back to gpio with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', kind: 'temp', x: 300, y: 0 },
    ],
    wires: [{ id: 'w1', bus: 'hyperbus', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' } }],
  }));
  assert.equal(doc.wires[0].bus, 'gpio');
  assert.ok(warnings.some((w) => w.includes('hyperbus')));
});

test('zones and notes are validated', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    zones: [{ id: 'z1', x: 0, y: 0, w: 100, h: 100 }, { id: 'z2', x: 0, y: 0 }],
    notes: [{ id: 't1', x: 5, y: 5, text: 'hi' }, { id: 't2', text: 'no position' }],
  }));
  assert.equal(doc.zones.length, 1);
  assert.equal(doc.zones[0].label, 'Zone');
  assert.equal(doc.notes.length, 1);
  assert.equal(warnings.length, 2);
});

test('invalid colors are neutralized with warnings', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0, color: '#f00"/><image href=x onerror=alert(1)>' }],
    zones: [{ id: 'z1', x: 0, y: 0, w: 10, h: 10, color: 'javascript:alert(1)' }],
  }));
  assert.equal(doc.nodes[0].color, null);
  assert.equal(doc.zones[0].color, '#4a90d9');
  assert.equal(warnings.length, 2);
});

test('valid hex colors pass through', () => {
  const { doc } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0, color: '#aB12cD' }],
  }));
  assert.equal(doc.nodes[0].color, '#aB12cD');
});

test('journey round-trips; invalid steps dropped; zoom clamped; missing -> []', () => {
  const good = {
    schema: 1,
    journey: [
      { id: 'j1', label: 'Intro', view: { cx: 1, cy: 2, zoom: 2 }, caption: 'hi' },
      { id: 'j2', view: { cx: 0, cy: 0, zoom: 99 } },
      { id: 'j3', view: { cx: 'nope', cy: 0, zoom: 1 } },
      { id: 'j1', view: { cx: 0, cy: 0, zoom: 1 } },
    ],
  };
  const { doc, warnings } = deserialize(JSON.stringify(good));
  assert.equal(doc.journey.length, 2);
  assert.deepEqual(doc.journey[0], { id: 'j1', label: 'Intro', view: { cx: 1, cy: 2, zoom: 2 }, caption: 'hi' });
  assert.deepEqual(doc.journey[1], { id: 'j2', label: 'Step', view: { cx: 0, cy: 0, zoom: 4 }, caption: '' });
  assert.equal(warnings.length, 2);
  const { doc: empty } = deserialize('{"schema":1}');
  assert.deepEqual(empty.journey, []);
  assert.throws(() => deserialize('{"journey": 5}'), /"journey" must be an array/);
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc.journey, doc.journey);
});

test('legacy journey views (screen offsets) convert to approximate centers', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    journey: [{ id: 'j1', label: 'Old', view: { x: 40, y: 40, zoom: 1 }, caption: '' }],
  }));
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc.journey[0].view, { cx: 600, cy: 360, zoom: 1 });
});

test('wire arrow and style fields round-trip, default null, and reject junk', () => {
  const base = {
    schema: 1,
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', kind: 'temp', x: 300, y: 0 },
    ],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' }, arrow: 'fwd', style: 'dotted' },
      { id: 'w2', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n2', port: 'gnd' }, arrow: 'sideways', style: 'zigzag' },
    ],
  };
  const { doc, warnings } = deserialize(JSON.stringify(base));
  assert.equal(doc.wires[0].arrow, 'fwd');
  assert.equal(doc.wires[0].style, 'dotted');
  assert.equal(doc.wires[1].arrow, null);
  assert.equal(doc.wires[1].style, null);
  assert.equal(warnings.length, 0, 'junk enum values are silently normalized');
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc.wires, doc.wires);
});

test('node metadata fields round-trip and default correctly', () => {
  const rich = {
    schema: 1,
    nodes: [{
      id: 'n1', kind: 'temp', x: 0, y: 0,
      addr: '0x76', rail: '3.3V', notes: 'ship with conformal coating',
      status: 'production', flags: ['bug', 'thermal'],
    }],
  };
  const { doc, warnings } = deserialize(JSON.stringify(rich));
  assert.deepEqual(warnings, []);
  assert.equal(doc.nodes[0].addr, '0x76');
  assert.equal(doc.nodes[0].rail, '3.3V');
  assert.equal(doc.nodes[0].notes, 'ship with conformal coating');
  assert.equal(doc.nodes[0].status, 'production');
  assert.deepEqual(doc.nodes[0].flags, ['bug', 'thermal']);
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc, doc);
  const { doc: old } = deserialize(JSON.stringify({ nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0 }] }));
  assert.equal(old.nodes[0].addr, '');
  assert.equal(old.nodes[0].rail, '');
  assert.equal(old.nodes[0].notes, '');
  assert.equal(old.nodes[0].status, null);
  assert.deepEqual(old.nodes[0].flags, []);
});

test('invalid node status and unknown flags are neutralized with warnings', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{
      id: 'n1', kind: 'mcu', x: 0, y: 0,
      status: 'vaporware', flags: ['bug', 'cursed', 7],
    }],
  }));
  assert.equal(doc.nodes[0].status, null);
  assert.deepEqual(doc.nodes[0].flags, ['bug']);
  assert.equal(warnings.length, 2);
});
