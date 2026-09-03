import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from '../src/palette.js';
import { BUSES } from '../src/buses.js';

const SIDES = ['left', 'right', 'top', 'bottom'];

test('every part is well-formed', () => {
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  for (const [key, part] of Object.entries(PARTS)) {
    assert.equal(part.kind, key, `${key} kind mismatch`);
    assert.ok(catIds.has(part.category), `${key} category`);
    assert.ok(part.name, `${key} name`);
    const ids = new Set();
    for (const port of part.ports) {
      assert.ok(!ids.has(port.id), `${key} duplicate port ${port.id}`);
      ids.add(port.id);
      assert.ok(SIDES.includes(port.side), `${key}.${port.id} side`);
      assert.ok(port.offset >= 0 && port.offset <= 1, `${key}.${port.id} offset`);
      assert.ok(BUSES[port.bus], `${key}.${port.id} unknown bus ${port.bus}`);
      assert.ok(port.name, `${key}.${port.id} name`);
    }
  }
});

test('every category has at least one part', () => {
  for (const c of CATEGORIES) {
    assert.ok(Object.values(PARTS).some((p) => p.category === c.id), c.id);
  }
});

test('getPart falls back to generic for unknown kinds', () => {
  assert.equal(getPart('definitely-not-real'), PARTS.generic);
  assert.equal(getPart('mcu'), PARTS.mcu);
});

test('every part has an icon path and every category a color', () => {
  for (const [key, part] of Object.entries(PARTS)) {
    assert.ok(typeof part.icon === 'string' && part.icon.startsWith('M'), `${key} icon`);
  }
  for (const c of CATEGORIES) {
    assert.match(CATEGORY_COLORS[c.id] ?? '', /^#[0-9a-f]{6}$/i, `${c.id} color`);
  }
});

// Generic robotics and automotive parts that vendor presets attach to.
test('robot-compute and ADAS parts expose the camera, CAN FD, and T1 buses they need', () => {
  const ports = (kind) => Object.fromEntries(PARTS[kind].ports.map((p) => [p.id, p.bus]));
  const aisbc = ports('aisbc');
  assert.equal(PARTS.aisbc.category, 'robotics');
  assert.equal(aisbc.csi1, 'mipi');
  assert.equal(aisbc.csi2, 'mipi');
  assert.equal(aisbc.canfd, 'canfd');
  assert.equal(aisbc.eth, 'eth');
  assert.equal(aisbc.gpio, 'gpio');
  assert.equal(ports('mipicam').csi, 'mipi');
  assert.equal(ports('depthcam').usb, 'usb');
  assert.equal(ports('servobus').bus, 'rs485');
  assert.equal(ports('motorctl').canfd, 'canfd');
  assert.equal(ports('motorctl').m1, 'pwm');
  for (const kind of ['autosoc', 'adas', 'frontcam', 'radar', 't1switch', 'vgateway']) {
    assert.equal(PARTS[kind].category, 'automotive', kind);
  }
  assert.equal(ports('autosoc').cam1, 'gmsl');
  assert.equal(ports('autosoc').t1, 't1');
  assert.equal(ports('adas').cam4, 'gmsl');
  assert.equal(ports('adas').canfd, 'canfd');
  assert.equal(ports('frontcam').out, 'gmsl');
  assert.equal(ports('radar').canfd, 'canfd');
  assert.equal(ports('radar').t1, 't1');
  assert.equal(ports('t1switch').p3, 't1');
  assert.equal(ports('vgateway').obd, 'can');
  assert.equal(ports('vgateway').canfd2, 'canfd');
});
