import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart, SEVERITIES, DISPOSITIONS } from '../src/palette.js';
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

test('every part has a 16-box icon path or a 24-box glyph, and every category a color', () => {
  for (const [key, part] of Object.entries(PARTS)) {
    const icon = typeof part.icon === 'string' && part.icon.startsWith('M');
    const glyph = typeof part.glyph === 'string' && part.glyph.startsWith('<');
    assert.ok(icon || glyph, `${key} icon or glyph`);
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
  assert.equal(ports('depthcam').csi, 'mipi', 'stereo modules can also hang off a CSI lane');
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

// net_draw's Network, Security & Edge, Process Flow, and Threats types, ported
// one-to-one: their glyphs, per-type accents, flow shapes, and threat border.
test('network, security, process-flow, and threat parts port net_draw types', () => {
  const byCat = (id) => Object.values(PARTS).filter((p) => p.category === id);
  for (const id of ['network', 'security', 'flow', 'threats']) {
    assert.ok(CATEGORIES.some((c) => c.id === id), `${id} category`);
  }
  assert.equal(byCat('network').length, 6);
  assert.equal(byCat('security').length, 6);
  assert.equal(byCat('flow').length, 10);
  assert.equal(byCat('threats').length, 17);
  for (const part of [...byCat('network'), ...byCat('security'), ...byCat('flow'), ...byCat('threats')]) {
    assert.match(part.accent, /^#[0-9a-f]{6}$/i, `${part.kind} accent`);
    assert.ok((part.glyph && part.glyph.startsWith('<')) || (part.icon && part.icon.startsWith('M')), `${part.kind} glyph or icon`);
  }
  const SHAPES = new Set(['terminator', 'process', 'decision', 'data', 'document', 'predefined', 'prep', 'manual', 'delay', 'connector']);
  for (const part of byCat('flow')) assert.ok(SHAPES.has(part.shape), `${part.kind} shape`);
  for (const part of byCat('threats')) assert.equal(part.threat, true, `${part.kind} threat`);
  assert.equal(PARTS.startend.defaultLabel, 'Start');
  assert.equal(PARTS.decision.defaultLabel, 'Decision?');
  assert.equal(PARTS.connector.defaultLabel, 'A');
  assert.equal(PARTS.router.accent, '#a78bfa');
  assert.equal(PARTS.threatactor.accent, '#ef4444');
  assert.ok(PARTS.router.ports.every((q) => q.bus === 'eth'), 'network devices link over Ethernet');
  assert.ok(PARTS.accesspoint.ports.some((q) => q.bus === 'rf'), 'an access point has a radio side');
  assert.ok(PARTS.process.ports.every((q) => q.bus === 'flow'), 'flow shapes connect with flow');
  assert.ok(PARTS.threatactor.ports.every((q) => q.bus === 'link'), 'threats connect with links');
});

test('every threat part has a field schema with a severity; the new threats use original icons', () => {
  for (const kind of ['vulnerability', 'misconfig', 'exploit', 'supplychain', 'ddos', 'mitm', 'spoofing', 'credential', 'dataleak', 'physical']) {
    const p = PARTS[kind];
    assert.ok(p, kind);
    assert.equal(p.category, 'threats', kind);
    assert.equal(p.threat, true, kind);
    assert.ok(p.icon.startsWith('M') && !p.glyph, `${kind} draws its own 16-box icon`);
  }
  for (const p of Object.values(PARTS).filter((q) => q.category === 'threats')) {
    assert.ok(Array.isArray(p.fields) && p.fields.length, `${p.kind} fields`);
    const ids = p.fields.map((fd) => fd.id);
    assert.equal(new Set(ids).size, ids.length, `${p.kind} unique field ids`);
    assert.ok(ids.includes('severity'), `${p.kind} severity`);
    for (const fd of p.fields) {
      assert.ok(fd.label, `${p.kind}.${fd.id} label`);
      if (fd.options) assert.ok(fd.options.length > 1, `${p.kind}.${fd.id} options`);
    }
  }
  assert.deepEqual(SEVERITIES, ['info', 'low', 'medium', 'high', 'critical']);
  const by = (kind, id) => PARTS[kind].fields.find((fd) => fd.id === id);
  assert.ok(by('threatactor', 'sophistication').options.includes('advanced'));
  assert.ok(by('threatactor', 'motivation').options.includes('ideology'));
  assert.ok(by('malware', 'type').options.includes('remote-access-trojan'));
  assert.ok(by('spoofing', 'target').options.includes('GNSS'));
  assert.ok(DISPOSITIONS.adversary && DISPOSITIONS.victim.color, 'disposition vocabulary');
  assert.equal(PARTS.mcu.fields, undefined, 'hardware parts keep the part-number trio');
});

test('network, security, and host parts carry IP address and DNS name fields; the ASN carries its number and prefix', () => {
  const byCat = (c) => Object.values(PARTS).filter((p) => p.category === c);
  const hosts = ['cloud', 'server', 'database', 'hostpc'].map((k) => PARTS[k]);
  for (const p of [...byCat('network'), ...byCat('security'), ...hosts]) {
    const ids = p.fields.map((fd) => fd.id);
    if (p.kind === 'asn') assert.deepEqual(ids, ['asn', 'prefix']);
    else assert.deepEqual(ids, ['ip', 'dns'], p.kind);
    assert.ok(p.fields.every((fd) => fd.label && fd.placeholder && !fd.options), `${p.kind} free text`);
    assert.equal(p.threat, undefined, `${p.kind} keeps its part number`);
  }
});
