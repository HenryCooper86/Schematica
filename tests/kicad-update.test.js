import test from 'node:test';
import assert from 'node:assert/strict';
import { fromKiCadData, kiCadId } from '../src/kicad.js';
import { previewKiCadUpdate, captureKiCadUpdate, prepareKiCadUpdate, applyKiCadUpdate } from '../src/kicad-update.js';
import { serialize, deserialize } from '../src/serialize.js';
import { Store } from '../src/state.js';

const fixture = () => ({ source: '/design/controller.kicad_sch', components: [{ ref: 'U1', value: 'MCU', footprint: 'QFN' }, { ref: 'R1', value: '10k' }], nets: [
  { name: 'SIG', nodes: [{ ref: 'U1', pin: '1' }, { ref: 'R1', pin: '2' }] }, { name: 'GND', nodes: [{ ref: 'U1', pin: '2' }] },
] });
const make = (change = () => {}) => { const data = fixture(); change(data); return fromKiCadData(data); };
const component = (doc, ref) => doc.nodes.find(n => n.id === kiCadId('kc', ref));
const removeR = data => { data.components = data.components.filter(c => c.ref !== 'R1'); data.nets[0].nodes = data.nets[0].nodes.filter(e => e.ref !== 'R1'); };

test('reordered components, nets and endpoints retain identities, layout and zero changes', () => {
  const before = make(), after = make(d => { d.components.reverse(); d.nets.reverse(); d.nets.forEach(n => n.nodes.reverse()); });
  assert.deepEqual(after, before);
  assert.deepEqual(previewKiCadUpdate(before, after).comparison.changes, []);
  const roundtrip = deserialize(serialize(before));
  assert.deepEqual(roundtrip.warnings, []);
  assert.deepEqual(roundtrip.doc.kicad, before.kicad);
  assert.deepEqual(previewKiCadUpdate(roundtrip.doc, after).comparison.changes, []);
});

test('value and footprint updates preserve surviving layout, notes, flags, status and authored items', () => {
  const before = make(), u = component(before, 'U1');
  Object.assign(u, { x: 123, y: -99, notes: 'Review rationale', label: 'Controller', flags: ['safety'], status: 'prototype', addr: '0x30', rail: '3V3' });
  const manual = structuredClone(u); manual.interfacePorts = { [u.part.ports[0].id]: { direction: 'input', source: 'datasheet' } }; manual.id = 'manual'; manual.locked = true; before.nodes.push(manual);
  const wire = structuredClone(before.wires[0]); wire.id = 'manual-wire'; wire.to = { node: manual.id, port: manual.part.ports[0].id }; before.wires.push(wire);
  before.notes.push({ id: 'note', text: 'Author note', x: 0, y: 0 });
  const incoming = make(d => { d.components[0].value = 'New MCU'; d.components[0].footprint = 'BGA'; });
  const snapshot = serialize(before), { proposal } = previewKiCadUpdate(before, incoming), next = component(proposal, 'U1');
  assert.equal(serialize(before), snapshot, 'preview is pure');
  assert.equal(next.sublabel, 'New MCU'); assert.equal(next.fields.footprint, 'BGA');
  for (const key of ['x', 'y', 'notes', 'label', 'flags', 'status', 'addr', 'rail', 'interfacePorts']) assert.deepEqual(next[key], u[key]);
  assert.deepEqual(proposal.nodes.find(n => n.id === manual.id), manual);
  assert.deepEqual(proposal.wires.find(w => w.id === wire.id), wire);
  assert.deepEqual(proposal.notes, before.notes);
});

test('adds, removals and rewires are visible; removed requirements remain explicit missing targets', () => {
  const before = make(), removed = component(before, 'R1').id;
  before.engineering = { requirements: [{ id: 'REQ1', text: 'Resistor', targets: [removed] }] };
  const incoming = make(d => { removeR(d); d.components.push({ ref: 'J1', value: 'Header' }); d.nets[1].nodes.push({ ref: 'J1', pin: '1' }); d.nets[0].nodes[0].pin = '3'; });
  const { proposal, comparison } = previewKiCadUpdate(before, incoming);
  assert.ok(comparison.changes.some(c => c.id === removed && c.type === 'removed'));
  assert.ok(comparison.changes.some(c => c.id === component(incoming, 'J1').id && c.type === 'added'));
  assert.ok(comparison.changes.some(c => c.collection === 'wires' && c.type === 'removed'));
  assert.ok(comparison.changes.some(c => c.collection === 'wires' && c.type === 'added'));
  assert.deepEqual(proposal.engineering.requirements[0].targets, [removed]);
  assert.ok(!proposal.nodes.some(n => n.id === removed));
  assert.deepEqual(deserialize(serialize(proposal)).doc.engineering.requirements[0].targets, [removed]);
});

test('matching provenance is required and never guessed from editable labels', () => {
  const before = make(), other = make(d => { d.source = '/other/controller.kicad_sch'; });
  assert.throws(() => previewKiCadUpdate(before, other), /does not match/);
  delete before.kicad;
  assert.throws(() => previewKiCadUpdate(before, make()), /Import a new board/);
  const bogus = make(); bogus.kicad.components[0].ref = 'user-node';
  assert.throws(() => previewKiCadUpdate(bogus, make()), /missing component|topology/);
  const legacy = make(); delete legacy.kicad;
  assert.deepEqual(deserialize(serialize(legacy)).warnings, []);
});

test('metadata is bounded and validated; duplicate/truncated identities are rejected', () => {
  for (const change of [d => { d.components.push(d.components[0]); }, d => { d.nets.push(d.nets[0]); }, d => { d.nets[0].nodes.push(d.nets[0].nodes[0]); }, d => { d.nets[0].name = ''; }, d => { d.nets[0].nodes[0].pin = 'pin-name-too-long'; }, d => { d.source = 'x'.repeat(1025); }, d => { d.components[0].ref = '\ud800'; }, d => { d.nets[0].nodes[0].pin = ' 1'; }]) assert.throws(() => make(change));
  assert.notEqual(kiCadId('kw', 'a:b', 'c', 'd'), kiCadId('kw', 'a', 'b:c', 'd'));
  const forged = make(); forged.kicad.nets.push(forged.kicad.nets[0]);
  const restored = deserialize(serialize(forged));
  assert.equal(restored.doc.kicad, undefined); assert.match(restored.warnings.join(), /provenance/);
  assert.throws(() => previewKiCadUpdate(restored.doc, make()), /Import a new board/);
});

test('manual attachments and declared endpoints on disappearing ports prevent destructive updates', () => {
  const before = make(), u = component(before, 'U1'), port = u.part.ports.find(p => p.name === '1').id;
  const after = make(d => { d.nets[0].nodes = d.nets[0].nodes.filter(e => e.ref !== 'U1'); });
  u.interfacePorts = { [port]: { source: 'datasheet' } };
  assert.throws(() => previewKiCadUpdate(before, after), /declared endpoints/);
  delete u.interfacePorts;
  const manual = structuredClone(before.wires.find(w => w.from.node === u.id && w.from.port === port)); manual.id = 'manual'; before.wires.push(manual);
  assert.throws(() => previewKiCadUpdate(before, after), /manual connections/);
});

test('locks and removed wire declarations are protected, unchanged locked items survive', () => {
  const before = make(), resistor = component(before, 'R1'); resistor.locked = true;
  assert.equal(component(previewKiCadUpdate(before, make()).proposal, 'R1').locked, true);
  assert.throws(() => previewKiCadUpdate(before, make(removeR)), /Unlock/);
  assert.throws(() => previewKiCadUpdate(before, make(d => { d.components[1].value = '20k'; })), /Unlock/);
  assert.throws(() => previewKiCadUpdate(before, make(d => { d.nets[0].nodes = d.nets[0].nodes.filter(e => e.ref !== 'R1'); })), /Unlock/);
  delete resistor.locked;
  before.wires.find(w => w.from.node === resistor.id).spec = { source: 'authored source' };
  assert.throws(() => previewKiCadUpdate(before, make(removeR)), /annotated or locked/);
});

test('local topology edits and new source identity collisions cannot adopt authored items', () => {
  const before = make(); before.nodes.push({ ...structuredClone(before.nodes[0]), id: kiCadId('kc', 'J1') });
  assert.throws(() => previewKiCadUpdate(before, make(d => { d.components.push({ ref: 'J1' }); })), /conflicts/);
  const altered = make(); altered.wires[0].to = structuredClone(altered.wires[1].to);
  assert.throws(() => previewKiCadUpdate(altered, make()), /topology/);
});

test('stale snapshots, identical board switches and pending edits reject; apply uses one undo step', () => {
  const store = new Store(make()), incoming = make(d => { d.components[0].value = 'New MCU'; });
  store.apply(doc => { doc.title = 'Authored board'; });
  const before = serialize(store.doc), steps = store.undoStack.length, preview = prepareKiCadUpdate(store, incoming);
  applyKiCadUpdate(store, preview); assert.equal(store.undoStack.length, steps + 1); assert.equal(store.generation, 0);
  store.undo(); assert.equal(serialize(store.doc), before);
  const stale = prepareKiCadUpdate(store, incoming); store.apply(doc => { doc.title = 'Changed'; });
  assert.throws(() => applyKiCadUpdate(store, stale), /board changed/);
  const switchStamp = captureKiCadUpdate(store); store.replaceDoc(structuredClone(store.doc));
  assert.throws(() => prepareKiCadUpdate(store, incoming, switchStamp), /board changed/);
  const batchPreview = prepareKiCadUpdate(store, incoming); store.beginBatch();
  assert.throws(() => applyKiCadUpdate(store, batchPreview), /board changed/); store.cancelBatch();
  const noOp = prepareKiCadUpdate(store, make()); const count = store.undoStack.length; applyKiCadUpdate(store, noOp); assert.equal(store.undoStack.length, count);
});


test('12-character ASCII pins retain exact names and stable IDs through persistence', () => {
  const doc = make(d => { d.nets[0].nodes[0].pin = 'abcdefghijkl'; });
  const restored = deserialize(serialize(doc));
  assert.deepEqual(restored.warnings, []);
  const pin = component(restored.doc, 'U1').part.ports.find(p => p.name === 'abcdefghijkl');
  assert.ok(pin); assert.ok(pin.id.length <= 24);
  assert.deepEqual(previewKiCadUpdate(restored.doc, doc).comparison.changes, []);
  const quotes = make(d => { d.nets[0].nodes[0].pin = '"'.repeat(12); });
  assert.deepEqual(deserialize(serialize(quotes)).warnings, []);
  assert.throws(() => make(d => { d.nets[0].nodes[0].pin = '引脚引脚引脚引脚引脚引脚'; }), /truncation/);
});

test('part-value replacement rejects stale engineering declarations, including after round trip', () => {
  const changes = [
    n => { n.budget = { activeMa: 25, inputV: 3.3 }; },
    n => { n.interfacePorts = { [n.part.ports[0].id]: { direction: 'input', protocols: ['uart'], source: 'old datasheet' } }; },
    n => { n.part.fields.push({ id: 'rating', label: 'Rated voltage' }); n.fields.rating = '3.3V'; },
  ];
  for (const declare of changes) {
    const before = make(); declare(component(before, 'U1'));
    const restored = deserialize(serialize(before)); assert.deepEqual(restored.warnings, []);
    const incoming = make(d => { d.components[0].value = 'Replacement MCU'; });
    const snapshot = serialize(restored.doc);
    assert.throws(() => previewKiCadUpdate(restored.doc, incoming), /replacement.*declarations/i);
    assert.equal(serialize(restored.doc), snapshot);
    assert.deepEqual(previewKiCadUpdate(restored.doc, make()).comparison.changes, [], 'unchanged source preserves authored declarations');
  }
});

test('required and power-role declarations block disappearing pins before and after persistence', () => {
  const after = make(d => { d.nets[0].nodes = d.nets[0].nodes.filter(e => e.ref !== 'U1'); });
  for (const kind of ['required', 'feeds', 'passes']) {
    const before = make(), node = component(before, 'U1'), port = node.part.ports.find(p => p.name === '1');
    if (kind === 'required') port.required = true; else node.part[kind] = [port.id];
    for (const doc of [before, deserialize(serialize(before)).doc]) {
      assert.throws(() => previewKiCadUpdate(doc, after), /declared endpoints/);
      const unchanged = previewKiCadUpdate(doc, make()).proposal;
      const restored = deserialize(serialize(unchanged)); assert.deepEqual(restored.warnings, []);
      assert.deepEqual(component(restored.doc, 'U1').part, component(doc, 'U1').part);
    }
  }
});

test('authored port order and side survive no-op, added pins, save/reload and undo history', () => {
  const before = make(), node = component(before, 'U1');
  node.part.ports.reverse(); node.part.ports.forEach(p => { p.side = 'left'; });
  const restored = deserialize(serialize(before)); assert.deepEqual(restored.warnings, []);
  const authoredPorts = component(restored.doc, 'U1').part.ports, store = new Store(restored.doc);
  const preview = prepareKiCadUpdate(store, make());
  assert.deepEqual(preview.comparison.changes, []);
  applyKiCadUpdate(store, preview); assert.equal(store.undoStack.length, 0);
  assert.deepEqual(component(store.doc, 'U1').part.ports, authoredPorts);
  const addition = make(d => { d.nets[0].nodes.push({ ref: 'U1', pin: '3' }); });
  const next = previewKiCadUpdate(store.doc, addition).proposal;
  assert.deepEqual(component(next, 'U1').part.ports.slice(0, 2), authoredPorts);
  assert.equal(component(next, 'U1').part.ports[2].name, '3');
  assert.deepEqual(component(deserialize(serialize(next)).doc, 'U1').part.ports, component(next, 'U1').part.ports);
});

test('all generated node and wire identities fit persistent journey references', () => {
  const data = (refLength, netLength) => ({ source: '/long.kicad_sch', components: [{ ref: 'U'.repeat(refLength), value: 'MCU' }, { ref: 'R1' }], nets: [{ name: 'N'.repeat(netLength), nodes: [{ ref: 'U'.repeat(refLength), pin: 'abcdefghijkl' }] }] });
  for (const lengths of [[150, 1], [1, 150], [90, 90]]) assert.throws(() => fromKiCadData(data(...lengths)), /identity.*200/i);
  const before = fromKiCadData(data(60, 60)), node = before.nodes.find(n => n.label === 'U'.repeat(60)), wire = before.wires[0];
  assert.ok([...before.nodes, ...before.wires].every(item => item.id.length <= 200));
  before.journey = [{ id: 'chapter', label: 'Long source references', caption: '', view: { cx: 0, cy: 0, zoom: 1 }, targets: { nodes: [node.id], wires: [wire.id] }, stops: [{ id: 'beat', node: node.id, caption: '' }] }];
  const roundtrip = deserialize(serialize(before)); assert.deepEqual(roundtrip.warnings, []);
  assert.deepEqual(roundtrip.doc.journey[0].targets, before.journey[0].targets);
  assert.deepEqual(roundtrip.doc.journey[0].stops, before.journey[0].stops);
  const incomingData = data(60, 60); incomingData.components = [{ ref: 'R1' }]; incomingData.nets = [];
  const next = previewKiCadUpdate(roundtrip.doc, fromKiCadData(incomingData)).proposal;
  const final = deserialize(serialize(next)); assert.deepEqual(final.doc.journey[0].targets, before.journey[0].targets);
  assert.deepEqual(final.doc.journey[0].stops, before.journey[0].stops);
});

test('case-distinct added pins cannot collide with surviving authored sides on save/reload', () => {
  const source = pins => fromKiCadData({ source: '/case-distinct.kicad_sch', components: [{ ref: 'U1', value: 'MCU' }], nets: pins.map(pin => ({ name: `net-${pin}`, nodes: [{ ref: 'U1', pin }] })) });
  const before = source(['a']), incoming = source(['a', 'A']);
  const node = component(before, 'U1'), originalPort = node.part.ports[0];
  assert.equal(originalPort.side, 'left');
  originalPort.required = true; node.part.feeds = [originalPort.id];
  assert.deepEqual(component(incoming, 'U1').part.ports.map(p => [p.name, p.side]), [['A', 'left'], ['a', 'right']]);
  assert.deepEqual(deserialize(serialize(incoming)).warnings, [], 'incoming source is independently representable');
  for (const current of [before, deserialize(serialize(before)).doc]) {
    const store = new Store(current), snapshot = serialize(current);
    assert.throws(() => prepareKiCadUpdate(store, incoming), /lose ports or part metadata/);
    assert.equal(serialize(store.doc), snapshot); assert.equal(store.undoStack.length, 0);
    const restored = deserialize(serialize(store.doc)); assert.deepEqual(restored.warnings, []);
    assert.deepEqual(restored.doc.wires, current.wires);
    assert.deepEqual(component(restored.doc, 'U1').part, component(current, 'U1').part);
  }
  // Explicitly moving the survivor resolves the collision without the updater
  // moving an authored port or discarding either source pin or declaration.
  originalPort.side = 'right';
  const { proposal } = previewKiCadUpdate(before, incoming), restored = deserialize(serialize(proposal));
  assert.deepEqual(restored.warnings, []);
  assert.deepEqual(restored.doc.wires, proposal.wires); assert.equal(restored.doc.wires.length, 2);
  assert.deepEqual(component(restored.doc, 'U1').part, component(proposal, 'U1').part);
  assert.deepEqual(component(restored.doc, 'U1').part.ports.map(p => [p.name, p.side]), [['a', 'right'], ['A', 'left']]);
  assert.deepEqual(component(restored.doc, 'U1').part.feeds, [originalPort.id]);
  assert.equal(component(restored.doc, 'U1').part.ports[0].required, true);
});
