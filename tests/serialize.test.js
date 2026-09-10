import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize, migrateRaw, MAX_TEXT, MAX_COORD } from '../src/serialize.js';
import { SCHEMA_VERSION } from '../src/state.js';
import { PORT_ALIASES } from '../src/palette.js';
import { Store, addNode, addWire, addZone, addNote, setLock } from '../src/state.js';
import { LIMITS } from '../src/custom.js';
import { initI18n, setLang } from '../src/i18n.js';

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

test('a whitespace-only title falls back to the language-appropriate default', () => {
  const text = '{"schema": 1, "title": "   "}';
  assert.equal(deserialize(text).doc.title, 'Untitled Board');
  setLang('zh');
  try {
    assert.equal(deserialize(text).doc.title, '未命名板图');
  } finally {
    setLang('en');
  }
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

test('a self-loop wire (both ends on one node) is dropped with a warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0 }, { id: 'n2', kind: 'temp', x: 300, y: 0 }],
    wires: [
      { id: 'loop', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n1', port: 'spi' } },
      { id: 'ok', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' } },
    ],
  }));
  assert.deepEqual(doc.wires.map((w) => w.id), ['ok']);
  assert.deepEqual(warnings, ['Dropped wire "loop": both ends are on the same node.']);
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

test('swimlanes round-trip; junk orient and lanes are normalized', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    zones: [
      { id: 'z1', x: 0, y: 0, w: 400, h: 300, label: 'Pipeline', color: '#a78bfa', kind: 'swimlane', orient: 'v', lanes: ['In', 'Out'] },
      { id: 'z2', x: 500, y: 0, w: 400, h: 300, kind: 'swimlane', orient: 'diagonal', lanes: ['ok', 7, ''] },
      { id: 'z3', x: 0, y: 400, w: 100, h: 100 },
    ],
  }));
  assert.deepEqual(doc.zones[0], {
    id: 'z1', x: 0, y: 0, w: 400, h: 300, label: 'Pipeline', color: '#a78bfa',
    kind: 'swimlane', orient: 'v', lanes: ['In', 'Out'],
  });
  assert.equal(doc.zones[1].orient, 'h', 'junk orient becomes h');
  assert.deepEqual(doc.zones[1].lanes, ['ok'], 'invalid lanes dropped');
  assert.ok(warnings.some((w) => w.includes('lanes')));
  assert.ok(!('kind' in doc.zones[2]), 'plain zones keep their exact shape');
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc.zones, doc.zones);
});

test('swimlane with entirely invalid lanes gets one default lane', () => {
  const { doc } = deserialize(JSON.stringify({
    zones: [{ id: 'z1', x: 0, y: 0, w: 400, h: 300, kind: 'swimlane', lanes: 'nope' }],
  }));
  assert.deepEqual(doc.zones[0].lanes, ['Lane 1']);
  assert.equal(doc.zones[0].orient, 'h');
});

test('wire flow and sneakernet style round-trip; junk flow becomes null', () => {
  const base = {
    schema: 1,
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', kind: 'temp', x: 300, y: 0 },
    ],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' }, style: 'sneakernet', flow: 'off' },
      { id: 'w2', bus: 'gnd', from: { node: 'n1', port: 'gnd' }, to: { node: 'n2', port: 'gnd' }, flow: 'sometimes' },
    ],
  };
  const { doc, warnings } = deserialize(JSON.stringify(base));
  assert.equal(doc.wires[0].style, 'sneakernet');
  assert.equal(doc.wires[0].flow, 'off');
  assert.equal(doc.wires[1].flow, null);
  assert.equal(warnings.length, 0, 'junk flow values are silently normalized');
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc.wires, doc.wires);
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

test('a missing label gets the part default, as a freshly placed card does', () => {
  initI18n({ storage: null });
  const text = JSON.stringify({
    nodes: [
      { id: 'a', kind: 'startend', x: 0, y: 0 },
      { id: 'b', kind: 'connector', x: 0, y: 0 },
      { id: 'c', kind: 'mcu', x: 0, y: 0 },
    ],
  });
  assert.deepEqual(deserialize(text).doc.nodes.map((n) => n.label), ['Start', 'A', 'MCU']);
  setLang('zh');
  try {
    assert.deepEqual(deserialize(text).doc.nodes.map((n) => n.label), ['开始', 'A', '微控制器']);
  } finally {
    setLang('en');
  }
});

test('a non-string label is replaced by the default with a warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0, label: 42 }, { id: 'n2', kind: 'mcu', x: 0, y: 0, label: '' }],
  }));
  assert.equal(doc.nodes[0].label, 'MCU');
  assert.equal(doc.nodes[1].label, '', 'an empty string is a label the user chose');
  assert.deepEqual(warnings, ['Ignored invalid label on node "n1".']);
});

test('legacy fixed card sizes are dropped and the card keeps its old center', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 100, y: 100, w: 160, h: 100, label: 'MCU' }],
  }));
  const n = doc.nodes[0];
  assert.equal('w' in n, false);
  assert.equal('h' in n, false);
  // Old center (180, 150); a 104x74 card centered there starts at (128, 113).
  assert.equal(n.x, 128);
  assert.equal(n.y, 113);
  assert.deepEqual(warnings, []);
  const junk = deserialize(JSON.stringify({ nodes: [{ id: 'n1', kind: 'mcu', x: 5, y: 6, w: -40, h: 0 }] }));
  assert.equal(junk.doc.nodes[0].x, 5, 'unusable legacy sizes are simply ignored');
  assert.deepEqual(junk.warnings, []);
});

test('zones with non-positive or non-finite size are dropped', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    zones: [
      { id: 'z1', x: 0, y: 0, w: 0, h: 50 },
      { id: 'z2', x: 0, y: 0, w: -10, h: 50 },
      { id: 'z3', x: 0, y: 0, w: 100, h: 100 },
    ],
  }));
  assert.equal(doc.zones.length, 1);
  assert.equal(doc.zones[0].id, 'z3');
  assert.equal(warnings.length, 2);
});

test('wires to an unknown-kind node survive on generic side ports', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', kind: 'quantum-cpu', x: 300, y: 0 },
    ],
    wires: [{ id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'qbit' } }],
  }));
  assert.equal(doc.wires.length, 1);
  assert.deepEqual(doc.wires[0].from, { node: 'n1', port: 'i2c' });
  assert.deepEqual(doc.wires[0].to, { node: 'n2', port: 'left' });
  assert.ok(warnings.some((w) => w.includes('generic ports')));
});

test('wires to a node with a missing kind survive on generic side ports too', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', x: 300, y: 0 },
    ],
    wires: [{ id: 'w1', bus: 'gpio', from: { node: 'n1', port: 'gpio1' }, to: { node: 'n2', port: 'mystery' } }],
  }));
  assert.equal(doc.nodes[1].kind, 'generic');
  assert.equal(doc.wires.length, 1);
  assert.deepEqual(doc.wires[0].to, { node: 'n2', port: 'left' });
  assert.ok(warnings.some((w) => w.includes('generic ports')));
});

test('locked round-trips on nodes, zones, and notes', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 100, 100);
  const z = addZone(store, { x: 0, y: 0, w: 400, h: 300 }, 'Board');
  const t = addNote(store, 500, 0, 'pinned');
  setLock(store, [a, z, t], true);
  const { doc, warnings } = deserialize(serialize(store.doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc, store.doc);
  assert.equal(doc.nodes[0].locked, true);
  assert.equal(doc.zones[0].locked, true);
  assert.equal(doc.notes[0].locked, true);
});

test('a non-boolean lock is dropped with a warning; false leaves no key', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0, locked: 'yes' }, { id: 'n2', kind: 'mcu', x: 0, y: 0, locked: false }],
    zones: [{ id: 'z1', x: 0, y: 0, w: 10, h: 10, locked: 1 }],
    notes: [{ id: 't1', x: 0, y: 0, text: 'n', locked: null }],
  }));
  for (const item of [doc.nodes[0], doc.nodes[1], doc.zones[0], doc.notes[0]]) {
    assert.equal('locked' in item, false);
  }
  assert.deepEqual(warnings.sort(), [
    'Ignored a non-boolean lock on "n1".',
    'Ignored a non-boolean lock on "t1".',
    'Ignored a non-boolean lock on "z1".',
  ]);
});

test('threat fields and disposition round-trip; unknown fields, blanks, and bad dispositions are cleaned', () => {
  const { doc, warnings } = deserialize(JSON.stringify({ nodes: [
    { id: 'n1', kind: 'threatactor', x: 0, y: 0, fields: { type: 'nation-state', severity: 'high', bogus: 'x', org: '  ' }, disposition: 'adversary' },
    { id: 'n2', kind: 'crystal', x: 0, y: 0, disposition: 'hero', fields: { severity: 'low' } },
    { id: 'n3', kind: 'mcu', x: 0, y: 0, disposition: null, fields: {} },
  ] }));
  assert.deepEqual(doc.nodes[0].fields, { type: 'nation-state', severity: 'high' });
  assert.equal(doc.nodes[0].disposition, 'adversary');
  assert.equal('fields' in doc.nodes[1], false, 'a part without a schema keeps no fields');
  assert.equal('disposition' in doc.nodes[1], false);
  assert.equal('fields' in doc.nodes[2], false, 'an empty map leaves no key');
  assert.equal('disposition' in doc.nodes[2], false, 'null disposition leaves no key and no warning');
  assert.deepEqual(warnings.sort(), [
    'Dropped fields on node "n2": Crystal has none.',
    'Dropped unknown field "bogus" on node "n1".',
    'Ignored unknown disposition "hero" on node "n2".',
  ]);
  const again = deserialize(serialize(doc));
  assert.deepEqual(again.doc, doc);
  assert.deepEqual(again.warnings, []);
});

test('a wire on a renamed port follows the alias instead of being dropped', () => {
  // Renaming a port on a known part must not silently strip every wire that
  // older files attached to the old id; the alias table remaps them.
  PORT_ALIASES.mcu = { twi: 'i2c' };
  try {
    const { doc, warnings } = deserialize(JSON.stringify({
      schema: 1,
      nodes: [
        { id: 'a', kind: 'mcu', x: 0, y: 0 },
        { id: 'b', kind: 'temp', x: 300, y: 0 },
      ],
      wires: [{ id: 'w', bus: 'i2c', from: { node: 'a', port: 'twi' }, to: { node: 'b', port: 'i2c' } }],
    }));
    assert.deepEqual(warnings, []);
    assert.equal(doc.wires.length, 1);
    assert.equal(doc.wires[0].from.port, 'i2c');
  } finally {
    delete PORT_ALIASES.mcu;
  }
});

test('migrateRaw upgrades a file one schema step at a time up to the target', () => {
  const steps = [];
  const migrations = {
    1: (raw) => { steps.push(1); return { ...raw, a: true }; },
    2: (raw) => { steps.push(2); return { ...raw, b: true }; },
  };
  const out = migrateRaw({ schema: 1, title: 'x' }, migrations, 3);
  assert.deepEqual(steps, [1, 2]);
  assert.deepEqual(out, { schema: 3, title: 'x', a: true, b: true });
  // A file without a schema is schema 1; a current file is untouched; a newer
  // file is left for the best-effort loader rather than "migrated" backwards.
  assert.deepEqual(migrateRaw({ title: 'y' }, migrations, 1), { title: 'y' });
  assert.deepEqual(migrateRaw({ schema: 5 }, migrations, 3), { schema: 5 });
});

test('the newer-schema warning names the version this app writes', () => {
  const { warnings } = deserialize(JSON.stringify({ schema: SCHEMA_VERSION + 1 }));
  assert.ok(warnings.some((w) => w.includes(`(${SCHEMA_VERSION})`)), warnings.join('\n'));
  const { doc } = deserialize('{}');
  assert.equal(doc.schema, SCHEMA_VERSION);
});

test('over-long text and out-of-range positions are clamped with a warning', () => {
  const long = 'x'.repeat(MAX_TEXT + 50);
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 1,
    nodes: [{ id: 'a', kind: 'mcu', x: MAX_COORD * 10, y: -MAX_COORD * 10, label: long, notes: long }],
    zones: [{ id: 'z', x: 0, y: 0, w: MAX_COORD * 10, h: 10, label: long }],
    notes: [{ id: 't', x: 1e300, y: 0, text: long }],
  }));
  assert.equal(doc.nodes[0].label.length, MAX_TEXT);
  assert.equal(doc.nodes[0].notes.length, MAX_TEXT);
  assert.equal(doc.nodes[0].x, MAX_COORD);
  assert.equal(doc.nodes[0].y, -MAX_COORD);
  assert.equal(doc.zones[0].w, MAX_COORD);
  assert.equal(doc.zones[0].label.length, MAX_TEXT);
  assert.equal(doc.notes[0].x, MAX_COORD);
  assert.equal(doc.notes[0].text.length, MAX_TEXT);
  assert.ok(warnings.some((w) => /Clamped/.test(w)), warnings.join('\n'));
  // Ordinary values are untouched.
  const { doc: ok, warnings: none } = deserialize(JSON.stringify({
    schema: 1, nodes: [{ id: 'a', kind: 'mcu', x: -5000.5, y: 7000, label: 'MCU' }],
  }));
  assert.equal(ok.nodes[0].x, -5000.5);
  assert.deepEqual(none, []);
});

const CUSTOM = {
  lib: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
  ports: [
    { id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true },
    { id: 'p2', name: 'CAN', side: 'left', bus: 'can', required: false },
  ],
  fields: [{ id: 'f1', label: 'Channels' }],
};

test('the app writes schema 2 and a schema 1 file upgrades with no change', () => {
  assert.equal(SCHEMA_VERSION, 2);
  const { doc, warnings } = deserialize('{"schema": 1, "title": "Old", "nodes": [{"id": "a", "kind": "mcu", "x": 0, "y": 0}]}');
  assert.deepEqual(warnings, []);
  assert.equal(doc.schema, 2);
  assert.equal(doc.nodes[0].kind, 'mcu');
  // What an older build sees: a schema 2 file left alone by migrateRaw.
  assert.deepEqual(migrateRaw({ schema: 2, title: 'New' }, {}, 1), { schema: 2, title: 'New' });
});

test('a custom node round-trips with its definition, fields, and wires', () => {
  const doc = {
    schema: 2, title: 'C', zones: [], notes: [], journey: [],
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, label: 'MD', sublabel: 'MD-4', color: null, addr: '', rail: '12V', notes: '', status: null, flags: [], part: CUSTOM, fields: { f1: '4' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0, label: 'MCU', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
    ],
    wires: [{ id: 'w', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' }, label: '', arrow: null, style: null, flow: null }],
  };
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(back, doc);
});

test('a customized supply keeps its power markers through a file, and a hostile file cannot invent them', () => {
  const REG = {
    name: 'Buck', category: 'power', accent: null, icon: { kind: 'regulator' },
    ports: [
      { id: 'in', name: 'IN', side: 'left', bus: 'power', required: false },
      { id: 'out', name: 'OUT', side: 'right', bus: 'power', required: false },
      { id: 'gnd', name: 'GND', side: 'right', bus: 'gnd', required: true },
    ],
    fields: [{ id: 'imax', label: 'Output current limit', placeholder: 'e.g. 600mA' }],
    feeds: ['out'], trio: true,
  };
  const doc = {
    schema: 2, title: 'C', zones: [], notes: [], journey: [], wires: [],
    nodes: [{ id: 'c', kind: 'custom', x: 0, y: 0, label: 'Buck', sublabel: '', color: null, addr: '', rail: '3V3', notes: '', status: null, flags: [], part: REG, fields: { imax: '600mA' } }],
  };
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(back, doc, 'the markers survive the file unchanged');
  // A pin that is not one of this definition's ports never reaches the rail walk.
  const evil = deserialize(JSON.stringify({
    schema: 2,
    nodes: [{ id: 'c', kind: 'custom', x: 0, y: 0, part: { ...REG, feeds: ['out', '__proto__', 'vcc'], passes: [{}] } }],
  }));
  assert.deepEqual(evil.doc.nodes[0].part.feeds, ['out']);
  assert.equal(evil.doc.nodes[0].part.passes, undefined);
  assert.ok(evil.warnings.some((w) => /may only name its own ports/.test(w)), evil.warnings.join(' | '));
});

test('a custom node with an unusable definition becomes a custom box and keeps its wires on the side ports', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 2,
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, part: { name: '' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0 },
    ],
    wires: [{ id: 'w', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' } }],
  }));
  assert.equal(doc.nodes[0].kind, 'generic');
  assert.equal('part' in doc.nodes[0], false);
  assert.equal(doc.wires.length, 1);
  assert.equal(doc.wires[0].from.port, 'right');
  assert.ok(warnings.some((w) => /had no usable definition/.test(w)), warnings.join('\n'));
});

test('a dropped custom port drops its wire; unknown field values drop; the definition is cleaned', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 2,
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, part: { ...CUSTOM, ports: [...CUSTOM.ports, { name: 'X', side: 'nowhere', bus: 'i2c' }] }, fields: { f1: '4', zz: 'gone' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0 },
    ],
    wires: [
      { id: 'w1', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' } },
      { id: 'w2', bus: 'i2c', from: { node: 'c', port: 'p3' }, to: { node: 'm', port: 'i2c' } },
    ],
  }));
  assert.deepEqual(doc.nodes[0].part.ports.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(doc.nodes[0].fields, { f1: '4' });
  assert.deepEqual(doc.wires.map((w) => w.id), ['w1']);
  assert.ok(warnings.some((w) => /no name or side/.test(w)));
  assert.ok(warnings.some((w) => /unknown field "zz"/.test(w)));
  assert.ok(warnings.some((w) => /missing endpoint/.test(w)));
});

test('a custom node keeps its own label and gets the definition name when it has none', () => {
  const { doc } = deserialize(JSON.stringify({ schema: 2, nodes: [{ id: 'c', kind: 'custom', x: 0, y: 0, part: CUSTOM }] }));
  assert.equal(doc.nodes[0].label, 'Motor driver x4');
  assert.equal(doc.nodes[0].part.name.length <= LIMITS.name, true);
});

test('deserialize warnings follow the interface language', () => {
  initI18n({ storage: null });
  const text = JSON.stringify({ schema: 2, nodes: [{ id: 'a', kind: 'nope', x: 0, y: 0 }], wires: [], zones: [], notes: [], journey: [] });
  assert.equal(deserialize(text).warnings[0], 'Unknown part "nope" became a custom box.');
  setLang('zh');
  try {
    assert.equal(deserialize(text).warnings[0], '未知部件“nope”已变为自定义框。');
  } finally {
    setLang('en');
  }
});
