import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { serialize, deserialize } from '../src/serialize.js';
import { getPart } from '../src/palette.js';
import { nodeRect } from '../src/geometry.js';
import { checkDoc } from '../src/drc.js';

test('there are at least three examples with unique ids and names', () => {
  assert.ok(EXAMPLES.length >= 3);
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, EXAMPLES.length);
  assert.equal(new Set(EXAMPLES.map((e) => e.name)).size, EXAMPLES.length);
});

test('every example round-trips through deserialize with zero warnings', () => {
  for (const ex of EXAMPLES) {
    const { doc, warnings } = deserialize(serialize(ex.doc));
    assert.deepEqual(warnings, [], `${ex.id}: ${warnings.join(' | ')}`);
    assert.deepEqual(doc, ex.doc, `${ex.id} round trip`);
  }
});

test('every example is substantial and presentable', () => {
  for (const ex of EXAMPLES) {
    assert.ok(ex.doc.nodes.length >= 5, `${ex.id} nodes`);
    assert.ok(ex.doc.wires.length >= 4, `${ex.id} wires`);
    assert.ok(ex.doc.zones.length >= 1, `${ex.id} zones`);
    assert.ok(ex.doc.journey.length >= 3, `${ex.id} journey`);
    for (const s of ex.doc.journey) {
      assert.ok(s.caption.length > 0, `${ex.id} step captions must not be empty`);
    }
  }
});

test('every example wire bus matches at least one endpoint port bus', () => {
  for (const ex of EXAMPLES) {
    for (const w of ex.doc.wires) {
      const busOf = (ref) => getPart(ex.doc.nodes.find((n) => n.id === ref.node).kind)
        .ports.find((p) => p.id === ref.port)?.bus;
      assert.ok(
        [busOf(w.from), busOf(w.to)].includes(w.bus),
        `${ex.id} ${w.id}: bus "${w.bus}" matches neither endpoint`,
      );
    }
  }
});

test('every zone fully contains at least one node', () => {
  for (const ex of EXAMPLES) {
    for (const z of ex.doc.zones) {
      const inside = ex.doc.nodes.map(nodeRect).some((n) => n.x >= z.x && n.y >= z.y
        && n.x + n.w <= z.x + z.w && n.y + n.h <= z.y + z.h);
      assert.ok(inside, `${ex.id} zone "${z.label}" contains no node`);
    }
  }
});

test('the D-Robotics and Horizon boards use the vendor presets and the new buses', () => {
  const rover = EXAMPLES.find((e) => e.id === 'rdk-rover');
  const adas = EXAMPLES.find((e) => e.id === 'journey-adas');
  assert.ok(rover && adas, 'both boards exist');
  assert.ok(rover.doc.nodes.some((n) => n.kind === 'aisbc' && n.sublabel === 'RDK X5'), 'rover computes on an RDK X5');
  const stereo = rover.doc.nodes.find((n) => n.kind === 'depthcam' && n.sublabel === 'RDK Stereo Camera');
  assert.ok(stereo, 'rover carries the D-Robotics stereo camera module');
  assert.ok(rover.doc.wires.some((w) => w.bus === 'mipi' && w.to.node === stereo.id && w.to.port === 'csi'), 'the stereo module rides a MIPI CSI lane');
  assert.ok(rover.doc.nodes.some((n) => n.kind === 'mipicam' && n.sublabel === 'RS800W'), 'front camera is the D-Robotics RS800W');
  assert.ok(rover.doc.wires.some((w) => w.bus === 'mipi') && rover.doc.wires.some((w) => w.bus === 'canfd'), 'rover wires MIPI cameras and CAN FD');
  assert.ok(adas.doc.nodes.some((n) => n.kind === 'adas' && /Journey 6/.test(n.sublabel)), 'ADAS controller runs a Journey 6');
  assert.ok(adas.doc.nodes.some((n) => /Horizon/.test(n.notes)), 'a Horizon stack is named in the notes');
  assert.ok(adas.doc.wires.some((w) => w.bus === 'gmsl') && adas.doc.wires.some((w) => w.bus === 't1'), 'ADAS board wires GMSL cameras and T1 Ethernet');
});

test('the sensor node board passes every design rule, so users can see what clean looks like', () => {
  const clean = EXAMPLES.find((e) => e.id === 'sensor-node-clean');
  assert.ok(clean, 'board exists');
  assert.deepEqual(checkDoc(clean.doc), [], 'no findings at all');
  // Every other board should still show the checker doing something.
  assert.ok(EXAMPLES.some((e) => e.id !== 'sensor-node-clean' && checkDoc(e.doc).length > 0));
});

test('the corporate network board ports net_draw\'s sample: devices, zones, and threat actors', () => {
  const net = EXAMPLES.find((e) => e.id === 'corporate-network');
  assert.ok(net, 'board exists');
  const kinds = new Set(net.doc.nodes.map((n) => n.kind));
  for (const k of ['internet', 'firewall', 'router', 'switch', 'accesspoint', 'threatactor', 'botnet', 'phishing']) assert.ok(kinds.has(k), k);
  assert.ok(net.doc.wires.some((w) => w.bus === 'eth') && net.doc.wires.some((w) => w.bus === 'link'));
  assert.ok(net.doc.zones.some((z) => z.label === 'DMZ'));
});
