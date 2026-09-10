import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { checkRdk } from '../src/rdk/checks.js';
import { checkDoc } from '../src/drc.js';
import { nodePart } from '../src/rdk/profiles.js';
import { serialize, deserialize } from '../src/serialize.js';

for (const id of ['rdk-rover', 'rdk-perception']) {
  test(`${id} documents a complete X5 stereo topology and descriptive software pipeline`, () => {
    const ex = EXAMPLES.find((e) => e.id === id);
    assert.ok(ex, 'starter exists');
    const { doc } = ex;
    const board = doc.nodes.find((n) => n.sublabel === 'RDK X5');
    const stereo = doc.nodes.find((n) => n.sublabel === 'GS130W');
    assert.ok(board && stereo, 'literal supported product identities');
    const csi = doc.wires.filter((w) => w.bus === 'mipi');
    assert.equal(csi.length, 2, 'stereo consumes both connectors, no third camera');
    assert.deepEqual(new Set(csi.map((w) => w.from.node)), new Set([board.id]));
    assert.deepEqual(new Set(csi.map((w) => w.from.port)), new Set(['csi1', 'csi2']));
    assert.deepEqual(new Set(csi.map((w) => w.to.node)), new Set([stereo.id]));
    assert.deepEqual(new Set(csi.map((w) => w.to.port)), new Set(['csi', 'csi-right']));
    for (const w of doc.wires) {
      const ports = [w.from, w.to].map((r) => nodePart(doc.nodes.find((n) => n.id === r.node)).ports.find((p) => p.id === r.port));
      assert.ok(ports.every(Boolean));
      assert.ok(!(ports.some((p) => p.bus === 'uart') && ports.some((p) => p.bus === 'rs485')), 'no UART-to-RS485 shortcut');
    }
    const stages = doc.nodes.filter((n) => n.kind === 'rdksoftware');
    assert.deepEqual(stages.map((n) => n.fields.package), ['hobot_sensor', 'hobot_dnn', 'hobot_codec', 'hobot_render']);
    for (const n of stages) {
      assert.equal(n.fields.target, board.id);
      assert.equal(n.fields.runtime || '', '');
    }
    assert.equal(doc.wires.filter((w) => w.bus === 'flow').length, 3);
    assert.deepEqual(checkRdk(doc), []);
    assert.deepEqual(new Set(checkDoc(doc).map((f) => f.rule)), new Set(['unconnected-power']), 'intentional supply/return omissions remain general findings');
    assert.ok(doc.nodes.every((n) => n.status === null), 'no tested hardware claims');
    assert.ok(doc.nodes.length >= 5 && doc.wires.length >= 4 && doc.zones.length >= 1);
    assert.ok(doc.journey.length >= 3 && doc.journey.every((j) => j.caption.length > 40));
    const restored = deserialize(serialize(doc));
    assert.deepEqual(restored.warnings, []);
    assert.deepEqual(restored.doc, doc);
  });
}
test('rover menu identity and document title remain stable', () => {
  const rover = EXAMPLES.find((e) => e.id === 'rdk-rover');
  assert.equal(rover.name, 'RDK X5 Rover (D-Robotics)');
  assert.equal(rover.doc.title, 'RDK X5 Rover');
});

const example = (id) => {
  const ex = EXAMPLES.find((e) => e.id === id);
  assert.ok(ex, `${id} exists`);
  return ex;
};
const portsResolve = (doc) => {
  for (const w of doc.wires) {
    const ports = [w.from, w.to].map((r) => nodePart(doc.nodes.find((n) => n.id === r.node)).ports.find((p) => p.id === r.port));
    assert.ok(ports.every(Boolean), `${w.id} names real ports`);
  }
};
const roundTrips = (doc) => {
  const restored = deserialize(serialize(doc));
  assert.deepEqual(restored.warnings, []);
  assert.deepEqual(restored.doc, doc);
};
const untargetedStages = (doc, board, packages) => {
  const stages = doc.nodes.filter((n) => n.kind === 'rdksoftware');
  assert.deepEqual(stages.map((n) => n.fields.package), packages);
  for (const n of stages) {
    assert.equal(n.fields.target, board.id);
    assert.equal(n.fields.runtime || '', '');
  }
  assert.equal(doc.wires.filter((w) => w.bus === 'flow').length, packages.length - 1);
};

test('rdk-x3-robot drives its wheels through a UART-linked MCU because the X3 has one CSI connector and no CAN FD', () => {
  const { doc, name, group } = example('rdk-x3-robot');
  assert.equal(name, 'RDK X3 Vision Robot (D-Robotics)');
  assert.equal(doc.title, 'RDK X3 Vision Robot');
  assert.equal(group, 'Embedded');
  const board = doc.nodes.find((n) => n.kind === 'aisbc');
  assert.equal(board.sublabel, 'RDK X3');
  const camera = doc.nodes.find((n) => n.kind === 'mipicam');
  assert.equal(camera.sublabel, 'IMX219');
  const csi = doc.wires.filter((w) => w.bus === 'mipi');
  assert.deepEqual(csi.map((w) => [w.from.node, w.from.port, w.to.node, w.to.port]), [[board.id, 'csi1', camera.id, 'csi']], 'one camera on the single connector');
  const onBoard = doc.wires.flatMap((w) => [w.from, w.to]).filter((r) => r.node === board.id).map((r) => r.port);
  assert.ok(!onBoard.includes('csi2') && !onBoard.includes('canfd'), 'no wire lands on a connector the X3 lacks');
  const mcu = doc.nodes.find((n) => n.kind === 'mcu');
  assert.ok(doc.wires.some((w) => w.bus === 'uart' && w.from.node === board.id && w.to.node === mcu.id), 'the board talks to the drive MCU over UART');
  const motors = doc.nodes.filter((n) => n.kind === 'motor');
  assert.equal(motors.length, 2);
  for (const m of motors) assert.ok(doc.wires.some((w) => w.bus === 'pwm' && w.from.node === mcu.id && w.to.node === m.id), `${m.label} is driven by the MCU`);
  portsResolve(doc);
  untargetedStages(doc, board, ['hobot_sensor', 'hobot_dnn', 'hobot_render']);
  const rdk = checkRdk(doc);
  assert.ok(rdk.every((f) => f.level === 'warning'), 'nothing the catalogue documents is violated');
  assert.deepEqual(new Set(rdk.map((f) => f.rule)), new Set(['rdk-interface', 'rdk-compatibility']), 'a sensor-name camera has no verified connector map or board fit, and the board says so');
  assert.deepEqual(new Set(checkDoc(doc).map((f) => f.rule)), new Set(['unconnected-power', 'rdk-interface', 'rdk-compatibility']));
  assert.ok(doc.nodes.every((n) => n.status === null), 'no tested hardware claims');
  assert.ok(doc.notes.some((t) => /compatib/i.test(t.text)), 'a note explains the open camera finding');
  assert.ok(doc.journey.length >= 3 && doc.journey.every((j) => j.caption.length > 40));
  roundTrips(doc);
});

test('rdk-s100-node keeps the S100 connector and stereo pair as unverified warnings and stays inside the documented input range', () => {
  const { doc, name, group } = example('rdk-s100-node');
  assert.equal(name, 'RDK S100 Perception Node (D-Robotics)');
  assert.equal(doc.title, 'RDK S100 Perception Node');
  assert.equal(group, 'Embedded');
  const board = doc.nodes.find((n) => n.kind === 'aisbc');
  assert.equal(board.sublabel, 'RDK S100');
  const stereo = doc.nodes.find((n) => n.kind === 'depthcam');
  assert.equal(stereo.sublabel, 'GS130WI');
  const csi = doc.wires.filter((w) => w.bus === 'mipi');
  assert.deepEqual(
    new Set(csi.map((w) => `${w.from.node}.${w.from.port}>${w.to.node}.${w.to.port}`)),
    new Set([`${board.id}.csi1>${stereo.id}.csi`, `${board.id}.csi2>${stereo.id}.csi-right`]),
  );
  const battery = doc.nodes.find((n) => n.kind === 'battery');
  assert.ok(doc.wires.some((w) => w.bus === 'power' && w.from.node === battery.id && w.to.node === board.id && w.to.port === 'vcc'), 'the pack feeds the board directly');
  assert.match(battery.rail, /^(1[2-9](\.\d+)?|20)V$/, 'pack voltage sits in the documented 12–20V window');
  assert.ok(doc.wires.some((w) => w.bus === 'eth' && [w.from.node, w.to.node].includes(board.id)), 'an Ethernet uplink leaves the board');
  portsResolve(doc);
  untargetedStages(doc, board, ['hobot_sensor', 'hobot_dnn', 'hobot_codec', 'hobot_render']);
  const rdk = checkRdk(doc);
  assert.ok(rdk.every((f) => f.level === 'warning'), 'nothing the catalogue documents is violated');
  assert.deepEqual(new Set(rdk.map((f) => f.rule)), new Set(['rdk-interface', 'rdk-stereo-links', 'rdk-compatibility']), 'the S100 has no verified port list, so every connector claim stays open');
  assert.deepEqual(new Set(checkDoc(doc).map((f) => f.rule)), new Set(['unconnected-power', 'rdk-interface', 'rdk-stereo-links', 'rdk-compatibility']));
  assert.ok(doc.nodes.every((n) => n.status === null), 'no tested hardware claims');
  assert.ok(doc.notes.some((t) => /expansion board/i.test(t.text)), 'a note names the camera expansion board requirement');
  assert.ok(doc.journey.length >= 3 && doc.journey.every((j) => j.caption.length > 40));
  roundTrips(doc);
});
