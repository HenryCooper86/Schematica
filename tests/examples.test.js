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

test('the vehicle OTA security board mixes cloud delivery, threats, a verification flow, and the device', () => {
  const ota = EXAMPLES.find((e) => e.id === 'ota-security');
  assert.ok(ota, 'board exists');
  assert.equal(EXAMPLES.some((e) => e.id === 'corporate-network'), false, 'the ported net_draw sample is gone');
  const kinds = new Set(ota.doc.nodes.map((n) => n.kind));
  for (const k of ['apigateway', 'waf', 'cdn', 'internet', 'insider', 'mitm', 'malware', 'startend', 'process', 'decision', 'dataio', 'gateway', 'vgateway', 'mcu', 'eeprom']) assert.ok(kinds.has(k), k);
  const buses = new Set(ota.doc.wires.map((w) => w.bus));
  for (const b of ['eth', 'flow', 'link', 't1', 'canfd', 'spi']) assert.ok(buses.has(b), b);
  assert.ok(ota.doc.zones.some((z) => z.label === 'Update verification'));
});

test('the ADAS security board covers perception spoofing, CAN injection, an implant, controls, and response', () => {
  const b = EXAMPLES.find((e) => e.id === 'adas-security');
  assert.ok(b, 'board exists');
  const kinds = new Set(b.doc.nodes.map((n) => n.kind));
  for (const k of ['adas', 'frontcam', 'radar', 'gps', 'vgateway', 't1switch', 'obd', 'autosoc', 'mcu', 'firewall', 'spoofing', 'physical', 'vulnerability', 'malware', 'c2', 'decision', 'dataio']) assert.ok(kinds.has(k), k);
  const buses = new Set(b.doc.wires.map((w) => w.bus));
  for (const bus of ['gmsl', 'canfd', 't1', 'can', 'link', 'flow']) assert.ok(buses.has(bus), bus);
  assert.ok(b.doc.zones.some((z) => z.label === 'Intrusion response'));
  assert.ok(b.doc.journey.length >= 4);
});

test('the security boards rate every threat and mark adversaries and victims', () => {
  for (const id of ['ota-security', 'adas-security']) {
    const b = EXAMPLES.find((e) => e.id === id);
    const threats = b.doc.nodes.filter((n) => getPart(n.kind).threat);
    assert.ok(threats.length >= 3, `${id} threats`);
    for (const n of threats) {
      assert.ok(n.fields?.severity, `${id}/${n.id} severity`);
      assert.equal(n.sublabel, '', `${id}/${n.id} uses fields, not a part number`);
    }
    assert.ok(threats.some((n) => n.disposition === 'adversary'), `${id} adversary`);
    assert.ok(b.doc.nodes.some((n) => n.disposition === 'victim'), `${id} victim`);
    const { doc, warnings } = deserialize(serialize(b.doc));
    assert.deepEqual(warnings, [], `${id} fields all known`);
    assert.deepEqual(doc, b.doc);
  }
});
