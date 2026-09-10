import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, MAX_OPS, OP_TYPES, EDIT_SCHEMA, pickPort, pickPorts } from '../src/ai/ops.js';
import { newDoc } from '../src/state.js';
import { MAX_TEXT } from '../src/serialize.js';

function node(id, kind, x = 0, y = 0, extra = {}) {
  return {
    id, kind, x, y, label: kind, sublabel: '', color: null, addr: '', rail: '', notes: '',
    status: null, flags: [], ...extra,
  };
}

test('the schema lists every op and needs only op', () => {
  assert.deepEqual(EDIT_SCHEMA.properties.ops.items.properties.op.enum, OP_TYPES);
  assert.deepEqual(EDIT_SCHEMA.properties.ops.items.required, ['op']);
  assert.deepEqual(EDIT_SCHEMA.required, ['ops']);
});

test('add_part creates a node with defaults, a ref, and a layout entry', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'mcu1', kind: 'mcu', sublabel: 'ESP32-S3', rail: '3.3V', status: 'production' },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.nodes.length, 1);
  const n = doc.nodes[0];
  assert.equal(res.refs.mcu1, n.id);
  assert.match(n.id, /^n[0-9a-z]{12}$/);
  assert.equal(n.kind, 'mcu');
  assert.equal(n.label, 'MCU');
  assert.equal(n.sublabel, 'ESP32-S3');
  assert.equal(n.rail, '3.3V');
  assert.equal(n.status, 'production');
  assert.deepEqual(n.flags, []);
  assert.deepEqual(res.layout.nodes, [n.id]);
  assert.deepEqual(res.layout.hints.get(n.id), { near: null, zone: null });
  assert.ok(res.touched.has(n.id));
  assert.match(res.changes[0], /^added node n\w+ mcu "MCU" \(ref mcu1\)$/);
});

test('add_part validates kind, status, flags, disposition, and fields', () => {
  const doc = newDoc('T');
  const bad = [
    [{ op: 'add_part', ref: 'a', kind: 'nope' }, /unknown kind "nope"/],
    [{ op: 'add_part', ref: 'a', kind: 'mcu', status: 'shiny' }, /unknown status/],
    [{ op: 'add_part', ref: 'a', kind: 'mcu', flags: ['bug', 'wet'] }, /unknown flags wet/],
    [{ op: 'add_part', ref: 'a', kind: 'mcu', disposition: 'pal' }, /unknown disposition/],
    [{ op: 'add_part', ref: 'a', kind: 'crystal', fields: { ip: '1.2.3.4' } }, /has no schema fields/],
    [{ op: 'add_part', ref: 'a', kind: 'mcu', fields: { ip: '1.2.3.4' } }, /unknown field "ip" on MCU/],
    [{ op: 'add_part', ref: 'a', kind: 'threatactor', fields: { nope: 'x' } }, /unknown field "nope"/],
    [{ op: 'add_part', ref: 'a', kind: 'threatactor', fields: { type: 'wizard' } }, /must be one of/],
    [{ op: 'add_part', ref: 'a', kind: 'threatactor', fields: { severity: 'huge' } }, /must be one of/],
    [{ op: 'add_part', kind: 'mcu' }, /needs a ref/],
  ];
  for (const [op, re] of bad) {
    const res = applyEdits(doc, [op]);
    assert.equal(res.ok, false, JSON.stringify(op));
    assert.equal(res.errors[0].index, 0);
    assert.match(res.errors[0].message, re);
    assert.equal(doc.nodes.length, 0, 'nothing applied');
  }
});

test('schema fields and disposition are stored the way deserialize stores them', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'apt', kind: 'threatactor', label: 'APT', disposition: 'adversary', fields: { severity: 'high', type: 'nation-state', sophistication: '' } },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const n = doc.nodes[0];
  assert.equal(n.disposition, 'adversary');
  assert.deepEqual(n.fields, { severity: 'high', type: 'nation-state' });
});

test('a ref cannot collide with an existing id or be reused', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('n1', 'mcu'));
  let res = applyEdits(doc, [{ op: 'add_part', ref: 'n1', kind: 'temp' }]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /already taken/);
  res = applyEdits(doc, [
    { op: 'add_part', ref: 'a', kind: 'temp' },
    { op: 'add_part', ref: 'a', kind: 'imu' },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].index, 1);
});

test('a batch is atomic and reports every failing index', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'a', kind: 'mcu' },
    { op: 'add_part', ref: 'b', kind: 'nope' },
    { op: 'set_title', title: 'X' },
    { op: 'add_part', ref: 'c', kind: 'temp', near: 'b' },
    { op: 'bogus' },
  ]);
  assert.equal(res.ok, false);
  assert.deepEqual(res.errors.map((e) => e.index), [1, 3, 4]);
  assert.match(res.errors[1].message, /belongs to an operation that failed/);
  assert.match(res.errors[2].message, /unknown op "bogus"/);
  assert.equal(doc.nodes.length, 0);
  assert.equal(doc.title, 'T');
});

test('set_title sets the title and blank falls back', () => {
  const doc = newDoc('T');
  assert.equal(applyEdits(doc, [{ op: 'set_title', title: 'Rover' }]).ok, true);
  assert.equal(doc.title, 'Rover');
  assert.equal(applyEdits(doc, [{ op: 'set_title', title: '   ' }]).ok, true);
  assert.equal(doc.title, 'Untitled Board');
});

test('the batch size is capped and ops must be an array', () => {
  const doc = newDoc('T');
  const many = Array.from({ length: MAX_OPS + 1 }, () => ({ op: 'set_title', title: 'x' }));
  let res = applyEdits(doc, many);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /at most 200/);
  res = applyEdits(doc, 'nope');
  assert.equal(res.ok, false);
});

test('add_note and update_note', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('n1', 'mcu', 100, 100));
  let res = applyEdits(doc, [{ op: 'add_note', ref: 'nt', text: 'All logic on 3.3V', near: 'n1' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const t = doc.notes[0];
  assert.match(t.id, /^t[0-9a-z]{12}$/);
  assert.equal(t.text, 'All logic on 3.3V');
  assert.deepEqual(res.layout.notes, [t.id]);
  assert.deepEqual(res.layout.hints.get(t.id), { near: 'n1', zone: null });
  res = applyEdits(doc, [{ op: 'update_note', id: t.id, text: 'Changed' }]);
  assert.equal(res.ok, true);
  assert.equal(doc.notes[0].text, 'Changed');
  res = applyEdits(doc, [{ op: 'update_note', id: 'nope', text: 'x' }]);
  assert.match(res.errors[0].message, /no note "nope"/);
  res = applyEdits(doc, [{ op: 'add_note', ref: 'z', text: 5 }]);
  assert.match(res.errors[0].message, /text must be a string/);
});

test('update_part changes fields, merges schema fields, and refuses kind', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('n1', 'mcu', 0, 0), node('n2', 'threatactor', 0, 0, { fields: { severity: 'low', type: 'spy' } }));
  let res = applyEdits(doc, [{ op: 'update_part', id: 'n1', sublabel: 'STM32H7', notes: 'Cortex-M7', status: 'prototype', flags: ['thermal'] }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.nodes[0].sublabel, 'STM32H7');
  assert.equal(doc.nodes[0].status, 'prototype');
  assert.deepEqual(doc.nodes[0].flags, ['thermal']);
  assert.match(res.changes[0], /^updated node n1 \(sublabel, notes, status, flags\)$/);
  res = applyEdits(doc, [{ op: 'update_part', id: 'n2', fields: { severity: 'critical', type: '' } }]);
  assert.equal(res.ok, true);
  assert.deepEqual(doc.nodes[1].fields, { severity: 'critical' });
  res = applyEdits(doc, [{ op: 'update_part', id: 'n1', status: null }]);
  assert.equal(doc.nodes[0].status, null);
  res = applyEdits(doc, [{ op: 'update_part', id: 'n1', kind: 'sbc' }]);
  assert.match(res.errors[0].message, /replace_part/);
  res = applyEdits(doc, [{ op: 'update_part', id: 'n1' }]);
  assert.match(res.errors[0].message, /changes nothing/);
});

function wire(id, bus, from, to) {
  return { id, bus, from, to, label: '', arrow: null, style: null, flow: null };
}

test('connect by bus picks ports: shared buses fan out, point-to-point takes a free port', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t1', 'temp'), node('t2', 'temp'), node('g1', 'gps'), node('g2', 'gps'));
  let res = applyEdits(doc, [
    { op: 'connect', from: { node: 'm' }, to: { node: 't1' }, bus: 'i2c' },
    { op: 'connect', from: { node: 'm' }, to: { node: 't2' }, bus: 'i2c' },
    { op: 'connect', ref: 'u1', from: { node: 'm' }, to: { node: 'g1' }, bus: 'uart' },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.wires[0].from.port, 'i2c');
  assert.equal(doc.wires[1].from.port, 'i2c', 'i2c is shared: same port twice');
  assert.equal(doc.wires[2].from.port, 'uart');
  assert.equal(doc.wires[2].to.port, 'uart');
  assert.match(res.refs.u1, /^w[0-9a-z]{12}$/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 'g2' }, bus: 'uart' }]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /every uart port on m is in use/);
});

test('connect with no bus uses the one data bus the parts share', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'), node('i', 'imu'));
  let res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 't' } }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.wires[0].bus, 'i2c', 'power and ground are set aside');
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 'i' } }]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /name the bus/);
});

test('connect with explicit ports: same bus works, different buses need a named bus and warn', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  let res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'i2c' }, to: { node: 't', port: 'i2c' } }]);
  assert.equal(res.ok, true);
  assert.equal(doc.wires[0].bus, 'i2c');
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'spi' }, to: { node: 't', port: 'i2c' } }]);
  assert.match(res.errors[0].message, /differ; name the bus/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'spi' }, to: { node: 't', port: 'i2c' }, bus: 'spi' }]);
  assert.equal(res.ok, true);
  assert.match(res.warnings[0], /joins a spi port to a i2c port/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'zzz' }, to: { node: 't', port: 'i2c' } }]);
  assert.match(res.errors[0].message, /no port "zzz"/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'i2c' }, to: { node: 't' } }]);
  assert.match(res.errors[0].message, /both ports or neither/);
});

test('explicit ports obey the point-to-point rule that pickPort enforces', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('g1', 'gps'), node('g2', 'gps'));
  let res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'uart' }, to: { node: 'g1', port: 'uart' } }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'uart' }, to: { node: 'g2', port: 'uart' } }]);
  assert.equal(res.ok, false, 'the mcu uart port already carries a wire');
  assert.match(res.errors[0].message, /port uart on m is already in use; uart is point-to-point/);
  assert.equal(doc.wires.length, 1);
  // A shared bus takes as many wires as the model asks for, named or picked.
  const shared = newDoc('T');
  shared.nodes.push(node('m', 'mcu'), node('t1', 'temp'), node('t2', 'temp'));
  res = applyEdits(shared, [
    { op: 'connect', from: { node: 'm', port: 'i2c' }, to: { node: 't1', port: 'i2c' } },
    { op: 'connect', from: { node: 'm', port: 'i2c' }, to: { node: 't2', port: 'i2c' } },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(shared.wires.length, 2);
});

test('connect refuses a wire that already joins the same endpoints', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  let res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 't' }, bus: 'i2c' }]);
  assert.equal(res.ok, false);
  assert.match(res.errors[0].message, /wire w1 already connects m\.i2c to t\.i2c; use update_wire/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 't', port: 'i2c' }, to: { node: 'm', port: 'i2c' }, bus: 'i2c' }]);
  assert.equal(res.ok, false, 'the same pair the other way round is the same wire');
  assert.equal(doc.wires.length, 1);
  // A second wire between the same nodes on a different port pair is fine.
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm', port: 'vcc' }, to: { node: 't', port: 'vcc' } }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.wires.length, 2);
});

test('update_wire warns about a bus neither port carries, as connect does', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  let res = applyEdits(doc, [{ op: 'update_wire', id: 'w1', bus: 'spi' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.wires[0].bus, 'spi');
  assert.match(res.warnings[0], /wire spi joins a i2c port to a i2c port/);
  // A bus one end carries, and an untyped bus over ports that agree, are silent.
  const quiet = newDoc('T');
  quiet.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  quiet.wires.push(wire('w1', 'i2c', { node: 'm', port: 'spi' }, { node: 't', port: 'i2c' }), wire('w2', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  res = applyEdits(quiet, [{ op: 'update_wire', id: 'w1', bus: 'spi' }, { op: 'update_wire', id: 'w2', bus: 'link' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.warnings, []);
});

test('untyped buses connect anything through a side port', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('a', 'threatactor'), node('c', 'camera'));
  const res = applyEdits(doc, [{ op: 'connect', from: { node: 'a' }, to: { node: 'c' }, bus: 'link', label: 'spoofs', arrow: 'fwd', style: 'dashed' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const w = doc.wires[0];
  assert.equal(w.bus, 'link');
  assert.equal(w.label, 'spoofs');
  assert.equal(w.arrow, 'fwd');
  assert.equal(w.style, 'dashed');
  assert.ok(w.to.port, 'the camera got a side port');
});

test('connect refuses self wires and unknown nodes', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'));
  let res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 'm' }, bus: 'i2c' }]);
  assert.match(res.errors[0].message, /itself/);
  res = applyEdits(doc, [{ op: 'connect', from: { node: 'm' }, to: { node: 'x' }, bus: 'i2c' }]);
  assert.match(res.errors[0].message, /no node "x"/);
});

test('update_wire sets bus, label, arrow, style, and flow', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  let res = applyEdits(doc, [{ op: 'update_wire', id: 'w1', label: 'SDA/SCL', arrow: 'both', style: 'dotted', flow: 'on' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual([doc.wires[0].label, doc.wires[0].arrow, doc.wires[0].style, doc.wires[0].flow], ['SDA/SCL', 'both', 'dotted', 'on']);
  res = applyEdits(doc, [{ op: 'update_wire', id: 'w1', arrow: 'sideways' }]);
  assert.match(res.errors[0].message, /arrow must be/);
  res = applyEdits(doc, [{ op: 'update_wire', id: 'w1', bus: 'warp' }]);
  assert.match(res.errors[0].message, /unknown bus/);
});

test('pickPort and pickPorts are usable on their own', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  assert.equal(pickPort(doc, doc.nodes[0], 'i2c'), 'i2c');
  const p = pickPorts(doc, doc.nodes[0], doc.nodes[1], undefined, undefined, 'power');
  assert.deepEqual(p, { from: 'vcc', to: 'vcc', bus: 'power', warning: null });
});

test('replace_part keeps supported fields, rewires by bus, and drops what cannot move', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu', 10, 20, { sublabel: 'ESP32', notes: 'keep', status: 'tested', flags: ['bug'] }), node('t', 'temp'), node('g', 'gps'));
  doc.wires.push(
    wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }),
    wire('w2', 'can', { node: 'm', port: 'can' }, { node: 'g', port: 'uart' }),
  );
  const res = applyEdits(doc, [{ op: 'replace_part', id: 'm', kind: 'sbc' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const m = doc.nodes[0];
  assert.equal(m.kind, 'sbc');
  assert.deepEqual([m.x, m.y, m.sublabel, m.notes, m.status, m.flags], [10, 20, 'ESP32', 'keep', 'tested', ['bug']]);
  assert.equal(doc.wires.length, 1, 'the CAN wire has no port on an SBC and is dropped');
  assert.equal(doc.wires[0].from.port, 'i2c', 'the SBC has an i2c port of the same id, so the wire stays');
  assert.match(res.warnings[0], /removed wires w2/);
  assert.ok(res.touched.has('m') && res.touched.has('w2'));
  assert.match(res.changes[0], /^replaced m with sbc \(kept 1, rewired 0, dropped 1\)$/);
});

test('replace_part rewires a port whose id changed but whose bus the new kind offers', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('c', 'camera'), node('m', 'mcu'));
  doc.wires.push(wire('w1', 'i2c', { node: 'c', port: 'i2c' }, { node: 'm', port: 'i2c' }));
  const res = applyEdits(doc, [{ op: 'replace_part', id: 'c', kind: 'gps' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.wires.length, 0, 'a GPS has no i2c port: the wire is dropped');
  const doc2 = newDoc('T');
  doc2.nodes.push(node('t', 'temp'), node('m', 'mcu'));
  doc2.wires.push(wire('w1', 'power', { node: 't', port: 'vcc' }, { node: 'm', port: 'vcc' }));
  const res2 = applyEdits(doc2, [{ op: 'replace_part', id: 't', kind: 'adcin' }]);
  assert.equal(res2.ok, true);
  assert.equal(doc2.wires[0].from.port, 'vcc', 'same id and bus on the new kind');
  assert.match(res2.changes[0], /kept 1, rewired 0, dropped 0/);
  const doc3 = newDoc('T');
  doc3.nodes.push(node('m', 'mcu'), node('p', 'adcin'));
  doc3.wires.push(wire('w1', 'adc', { node: 'm', port: 'adc' }, { node: 'p', port: 'out' }));
  const res3 = applyEdits(doc3, [{ op: 'replace_part', id: 'm', kind: 'dsp' }]);
  assert.equal(res3.ok, true, JSON.stringify(res3));
  assert.equal(doc3.wires[0].from.port, 'adc1', 'no port called adc on a DSP, but adc1 carries the adc bus');
  assert.match(res3.changes[0], /kept 0, rewired 1, dropped 0/);
});

test('replace_part drops schema fields the new kind lacks or whose value it does not allow', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('a', 'threatactor', 0, 0, { fields: { severity: 'high', type: 'spy', sophistication: 'expert' } }));
  let res = applyEdits(doc, [{ op: 'replace_part', id: 'a', kind: 'malware' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(doc.nodes[0].fields, { severity: 'high' }, 'malware has a type field too, but "spy" is not a malware type');
  assert.match(res.warnings[0], /dropped fields type, sophistication/);
  res = applyEdits(doc, [{ op: 'replace_part', id: 'a', kind: 'malware' }]);
  assert.match(res.errors[0].message, /already a malware/);
  res = applyEdits(doc, [{ op: 'replace_part', id: 'a', kind: 'nope' }]);
  assert.match(res.errors[0].message, /unknown kind/);
});

test('remove takes any ids, drops the wires of removed nodes, and forgets layout work', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  doc.zones.push({ id: 'z1', x: 0, y: 0, w: 100, h: 100, label: 'Z', color: '#4a90d9' });
  doc.notes.push({ id: 't1', x: 0, y: 0, text: 'n' });
  let res = applyEdits(doc, [
    { op: 'add_part', ref: 'x', kind: 'imu' },
    { op: 'remove', ids: ['t', 'z1', 't1', 'x'] },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(doc.nodes.map((n) => n.id), ['m']);
  assert.deepEqual(doc.wires, []);
  assert.deepEqual(doc.zones, []);
  assert.deepEqual(doc.notes, []);
  assert.deepEqual(res.layout.nodes, [], 'the removed new node needs no placement');
  res = applyEdits(doc, [{ op: 'remove', ids: ['nope'] }]);
  assert.match(res.errors[0].message, /no item "nope"/);
  res = applyEdits(doc, [{ op: 'remove', ids: [] }]);
  assert.match(res.errors[0].message, /needs ids/);
});

test('remove refuses a locked item and applies nothing else in the batch', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('p', 'imu', 0, 0, { locked: true }));
  doc.zones.push({ id: 'z1', x: 0, y: 0, w: 100, h: 100, label: 'Z', color: '#4a90d9', locked: true });
  doc.notes.push({ id: 't1', x: 0, y: 0, text: 'n', locked: true });
  for (const id of ['p', 'z1', 't1']) {
    const res = applyEdits(doc, [{ op: 'remove', ids: ['m', id] }]);
    assert.equal(res.ok, false);
    assert.match(res.errors[0].message, new RegExp(`"${id}" is locked`));
    assert.match(res.errors[0].message, /update_part\/update_zone\/update_note/, 'the message says how to proceed');
    assert.equal(doc.nodes.length, 2, 'the batch is atomic: nothing was removed');
  }
});

test('update_part, update_zone, and update_note set and clear the lock', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'));
  doc.zones.push({ id: 'z1', x: 0, y: 0, w: 100, h: 100, label: 'Z', color: '#4a90d9' });
  doc.notes.push({ id: 't1', x: 0, y: 0, text: 'n' });
  let res = applyEdits(doc, [
    { op: 'update_part', id: 'm', locked: true },
    { op: 'update_zone', id: 'z1', locked: true },
    { op: 'update_note', id: 't1', locked: true },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual([doc.nodes[0].locked, doc.zones[0].locked, doc.notes[0].locked], [true, true, true]);
  // Unlocking, then removing, is the route the refusal message points at.
  res = applyEdits(doc, [
    { op: 'update_part', id: 'm', locked: false },
    { op: 'update_zone', id: 'z1', locked: false },
    { op: 'update_note', id: 't1', locked: false },
    { op: 'remove', ids: ['m', 'z1', 't1'] },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual([doc.nodes, doc.zones, doc.notes], [[], [], []]);
});

test('a non-boolean lock fails the op, and update_note still needs a change', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'));
  doc.notes.push({ id: 't1', x: 0, y: 0, text: 'n' });
  let res = applyEdits(doc, [{ op: 'update_part', id: 'm', locked: 'yes' }]);
  assert.match(res.errors[0].message, /locked must be true or false/);
  res = applyEdits(doc, [{ op: 'update_note', id: 't1' }]);
  assert.match(res.errors[0].message, /update_note changes nothing/);
  assert.equal('locked' in doc.nodes[0], false, 'a failed batch leaves no trace');
});

test('add_zone needs members, validates colour, and marks new members for placement inside it', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu', 100, 100));
  let res = applyEdits(doc, [
    { op: 'add_part', ref: 'bat', kind: 'battery' },
    { op: 'add_zone', ref: 'pwr', label: 'Power', color: '#f87171', members: ['bat', 'm'] },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const z = doc.zones[0];
  assert.match(z.id, /^z[0-9a-z]{12}$/);
  assert.deepEqual([z.label, z.color, z.x, z.y, z.w, z.h], ['Power', '#f87171', 0, 0, 0, 0]);
  assert.deepEqual(res.layout.zones, [{ id: z.id, members: [res.refs.bat, 'm'] }]);
  assert.equal(res.layout.hints.get(res.refs.bat).zone, z.id, 'a new member is placed inside the zone');
  assert.ok(res.touched.has(z.id));
  for (const [op, re] of [
    [{ op: 'add_zone', ref: 'q', label: 'Q', members: [] }, /at least one member/],
    [{ op: 'add_zone', ref: 'q', label: 'Q', members: ['nope'] }, /no node "nope"/],
    [{ op: 'add_zone', ref: 'q', label: 'Q', members: ['m'], color: 'red' }, /colour must be/],
    [{ op: 'add_zone', ref: 'q', members: ['m'] }, /label must be a string/],
  ]) {
    res = applyEdits(doc, [op]);
    assert.equal(res.ok, false);
    assert.match(res.errors[0].message, re);
  }
});

test('update_zone changes label and colour, and members ask for a refit', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu', 100, 100), node('t', 'temp', 400, 100));
  doc.zones.push({ id: 'z1', x: 0, y: 0, w: 10, h: 10, label: 'Z', color: '#4a90d9' });
  let res = applyEdits(doc, [{ op: 'update_zone', id: 'z1', label: 'Sensors', color: '#22d3ee', members: ['t'] }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.zones[0].label, 'Sensors');
  assert.equal(doc.zones[0].color, '#22d3ee');
  assert.deepEqual(res.layout.refit, [{ id: 'z1', members: ['t'] }]);
  res = applyEdits(doc, [{ op: 'update_zone', id: 'z1' }]);
  assert.match(res.errors[0].message, /changes nothing/);
});

test('names from Object.prototype are not ops, kinds, buses, or dispositions', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    let res = applyEdits(doc, [{ op: name }]);
    assert.equal(res.ok, false, name);
    assert.match(res.errors[0].message, /unknown op/, name);
    res = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: name }]);
    assert.match(res.errors[0].message, /unknown kind/, name);
    res = applyEdits(doc, [{ op: 'update_wire', id: 'w1', bus: name }]);
    assert.match(res.errors[0].message, /unknown bus/, name);
    res = applyEdits(doc, [{ op: 'update_part', id: 'm', disposition: name }]);
    assert.match(res.errors[0].message, /unknown disposition/, name);
  }
  assert.equal(doc.nodes.length, 2);
});

test('a batch may not leave a new zone without members', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'a', kind: 'mcu' },
    { op: 'add_zone', ref: 'z', label: 'Z', members: ['a'] },
    { op: 'remove', ids: ['a'] },
  ]);
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].index, 2);
  assert.match(res.errors[0].message, /empties zone/);
  assert.equal(doc.zones.length, 0);
});

test('the assistant edits plain zones only: swimlanes refuse members and placement', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu', 100, 100));
  doc.zones.push({ id: 'l1', x: 0, y: 0, w: 400, h: 300, label: 'Lanes', color: '#a78bfa', kind: 'swimlane', orient: 'h', lanes: ['A', 'B'] });
  let res = applyEdits(doc, [{ op: 'update_zone', id: 'l1', members: ['m'] }]);
  assert.match(res.errors[0].message, /swimlane/);
  res = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'temp', in: 'l1' }]);
  assert.match(res.errors[0].message, /swimlane/);
  res = applyEdits(doc, [{ op: 'update_zone', id: 'l1', label: 'Renamed' }]);
  assert.equal(res.ok, true, 'label and colour still work on a swimlane');
});

test('remove scrubs wires it cascades away from the touched set', () => {
  const doc = newDoc('T');
  doc.nodes.push(node('m', 'mcu'), node('t', 'temp'));
  doc.wires.push(wire('w1', 'i2c', { node: 'm', port: 'i2c' }, { node: 't', port: 'i2c' }));
  const res = applyEdits(doc, [
    { op: 'update_wire', id: 'w1', label: 'SDA' },
    { op: 'remove', ids: ['t'] },
  ]);
  assert.equal(res.ok, true);
  assert.ok(!res.touched.has('w1'), 'w1 no longer exists');
  assert.ok(!res.touched.has('t'));
  assert.equal(doc.wires.length, 0);
});

test('over-long text is cut to MAX_TEXT with a warning', () => {
  const doc = newDoc('T');
  const long = 'x'.repeat(MAX_TEXT + 5);
  const res = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'mcu', notes: long }, { op: 'add_note', ref: 'n', text: long }]);
  assert.equal(res.ok, true);
  assert.equal(doc.nodes[0].notes.length, MAX_TEXT);
  assert.equal(doc.notes[0].text.length, MAX_TEXT);
  assert.equal(res.warnings.filter((w) => /cut to/.test(w)).length, 2);
});

const DEF = {
  name: 'Motor driver x4', category: 'actuators',
  ports: [
    { name: 'VCC', side: 'top', bus: 'power', required: true },
    { name: 'GND', side: 'top', bus: 'gnd', required: true },
    { name: 'CAN', side: 'left', bus: 'can' },
    { name: 'M1', side: 'right', bus: 'pwm' },
  ],
  fields: [{ label: 'Channels' }],
};

test('add_part with kind custom takes an inline definition and wires by bus', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF, sublabel: 'MD-4', fields: { f1: '4' } },
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const n = doc.nodes[0];
  assert.equal(n.kind, 'custom');
  assert.equal(n.label, 'Motor driver x4');
  assert.equal(n.sublabel, 'MD-4');
  assert.deepEqual(n.part.ports.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(n.fields, { f1: '4' });
  assert.equal(doc.wires[0].from.port, 'p3');
  assert.equal(doc.wires[0].bus, 'can');
  assert.match(res.changes[0], /^added node n\w+ custom "Motor driver x4" \(ref md\)$/);
});

test('add_part with kind custom rejects bad or missing definitions and needs exactly one source', () => {
  const doc = newDoc('T');
  const bad = [
    [{ op: 'add_part', ref: 'a', kind: 'custom' }, /exactly one of custom/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: DEF, template: 'lp1' }, /exactly one of custom/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: { name: '' } }, /no name/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', template: 'lp1' }, /no library/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: DEF, fields: { zz: '1' } }, /unknown field "zz"/],
  ];
  for (const [op, re] of bad) {
    const res = applyEdits(doc, [op]);
    assert.equal(res.ok, false, JSON.stringify(op));
    assert.match(res.errors[0].message, re);
  }
  assert.equal(doc.nodes.length, 0);
  const warned = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'custom', custom: { ...DEF, ports: [{ name: 'X', side: 'left', bus: 'warp' }] } }]);
  assert.equal(warned.ok, true, JSON.stringify(warned));
  assert.ok(warned.warnings.some((w) => /unknown bus "warp"/.test(w)), 'normalizer warnings reach the tool result');
});

test('add_part from a library template stamps the template id and drops the template bookkeeping', () => {
  const doc = newDoc('T');
  const library = { get: (id) => (id === 'lp1' ? { id: 'lp1', updated: '2026-09-07', ...DEF } : null), list: () => [] };
  const res = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'custom', template: 'lp1' }], { library });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.nodes[0].part.lib, 'lp1');
  assert.equal(doc.nodes[0].part.name, 'Motor driver x4');
  assert.equal('updated' in doc.nodes[0].part, false);
  assert.equal('id' in doc.nodes[0].part, false);
  const miss = applyEdits(doc, [{ op: 'add_part', ref: 'b', kind: 'custom', template: 'nope' }], { library });
  assert.match(miss.errors[0].message, /no library template "nope"/);
});

test('update_part with custom replaces the definition, matches ports by name, and rewires or drops the rest', () => {
  const doc = newDoc('T');
  const setup = applyEdits(doc, [
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF, fields: { f1: '4' } },
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'add_part', ref: 'bat', kind: 'battery' },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
    { op: 'connect', from: { node: 'bat' }, to: { node: 'md' }, bus: 'power' },
    { op: 'connect', from: { node: 'md', port: 'p4' }, to: { node: 'mcu', port: 'pwm' }, bus: 'pwm' },
  ]);
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const md = doc.nodes[0];
  const res = applyEdits(doc, [{
    op: 'update_part', id: md.id,
    custom: { ...DEF, ports: [
      { name: 'can', side: 'bottom', bus: 'can' },
      { name: 'VIN', side: 'top', bus: 'power', required: true },
      { name: 'EN', side: 'left', bus: 'gpio' },
    ], fields: [{ label: 'channels' }, { label: 'Drive', options: ['a', 'b'] }] },
  }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const updated = doc.nodes.find((n) => n.id === md.id); // applyEdits commits a fresh clone; md is stale after res
  assert.deepEqual(updated.part.ports.map((p) => [p.id, p.name]), [['p3', 'can'], ['p5', 'VIN'], ['p6', 'EN']], 'CAN keeps p3 by name; the rest get ids no old port had');
  assert.deepEqual(updated.part.fields.map((f) => f.id), ['f1', 'f2'], 'Channels keeps f1 by label');
  assert.deepEqual(updated.fields, { f1: '4' });
  const can = doc.wires.find((w) => w.bus === 'can');
  const pwr = doc.wires.find((w) => w.bus === 'power');
  assert.equal(can.from.port, 'p3', 'kept');
  assert.equal(pwr.to.port, 'p5', 'rewired to the new power port');
  assert.equal(doc.wires.some((w) => w.bus === 'pwm'), false, 'the PWM wire had no port to go to');
  assert.match(res.changes[0], /custom \(kept 1, rewired 1, dropped 1\)/);
  assert.ok(res.warnings.some((w) => /removed wires/.test(w)));
  assert.match(applyEdits(doc, [{ op: 'update_part', id: md.id, custom: { name: '' } }]).errors[0].message, /no name/);
});

test('update_part with custom on a built-in part fails; replace_part to custom fails; replace_part from custom works', () => {
  const doc = newDoc('T');
  const setup = applyEdits(doc, [
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
  ]);
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const [mcu, md] = doc.nodes;
  assert.match(applyEdits(doc, [{ op: 'update_part', id: mcu.id, custom: DEF }]).errors[0].message, /not a custom part/);
  assert.match(applyEdits(doc, [{ op: 'replace_part', id: mcu.id, kind: 'custom', custom: DEF }]).errors[0].message, /use add_part/);
  const res = applyEdits(doc, [{ op: 'replace_part', id: md.id, kind: 'cantrx' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const updatedMd = doc.nodes.find((n) => n.id === md.id); // applyEdits commits a fresh clone; md is stale after res
  assert.equal(updatedMd.kind, 'cantrx');
  assert.equal('part' in updatedMd, false);
  assert.equal(doc.wires.length, 1, 'the CAN wire found a CAN port on the transceiver');
});

test('the schema documents custom and template', () => {
  const props = EDIT_SCHEMA.properties.ops.items.properties;
  assert.equal(props.custom.type, 'object');
  assert.equal(props.template.type, 'string');
  assert.match(props.kind.description, /custom/);
});
