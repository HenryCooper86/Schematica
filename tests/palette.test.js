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

test('every power marker names a power pin the part actually has', () => {
  for (const [key, part] of Object.entries(PARTS)) {
    const ids = new Map(part.ports.map((p) => [p.id, p]));
    for (const marker of ['feeds', 'passes']) {
      for (const id of part[marker] || []) {
        assert.ok(ids.has(id), `${key}.${marker} names missing port ${id}`);
        assert.equal(ids.get(id).bus, 'power', `${key}.${marker} names ${id}, which is not on the power bus`);
      }
    }
    assert.ok(!(part.feeds && part.passes), `${key} cannot both head a rail and pass one through`);
  }
});

test('a fuse and a fuse box can state the one number they exist for', () => {
  for (const key of ['fuse', 'fusebox']) {
    const part = PARTS[key];
    assert.deepEqual(part.fields.map((f) => f.id), ['imax'], key);
    assert.equal(part.fields[0].label, 'Current rating', `${key} is rated, not limited: it is not a supply`);
    assert.ok(part.passes.length, `${key} still carries its rail straight through`);
    assert.equal(part.trio, true, `${key} keeps its part number, address and rail lines`);
  }
});

test('a USB port heads a 5V rail without demanding a wire on it', () => {
  const usb = PARTS.usbport;
  const vbus = usb.ports.find((p) => p.id === 'vbus');
  assert.equal(vbus.bus, 'power');
  assert.deepEqual(usb.feeds, ['vbus']);
  assert.deepEqual(usb.fields.map((f) => f.id), ['imax']);
  // The unconnected-supply rule requires a pin called vcc or gnd; a socket
  // used only for its data pins must not be reported as a fault.
  assert.equal(usb.ports.some((p) => p.id === 'vcc' || p.id === 'gnd'), false);
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

// The Network, Security & Edge, Process Flow, and Threats types follow
// net_draw's model: 24-box glyphs, per-type accents, flow shapes, threat border.
test('network, security, process-flow, and threat parts follow the net_draw model', () => {
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
  // A hardware part's own fields are the power-budget currents, and `trio`
  // says it still carries the part number, address, and rail beside them.
  assert.deepEqual(PARTS.mcu.fields.map((fd) => fd.id), ['ityp', 'ipeak']);
  assert.equal(PARTS.mcu.trio, true, 'hardware parts keep the part-number trio');
  assert.equal(PARTS.threatactor.trio, undefined, 'a threat replaces the trio instead');
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

// The 24-box glyphs used to be byte-for-byte copies of net_draw's icons, which
// carry no open licence. They were replaced by Lucide icons (ISC) and our own
// flowchart shapes; these are the SHA-1 prefixes of the old markup, so a copy
// can never come back unnoticed.
const NET_DRAW_GLYPH_HASHES = new Set([
  '0451aad603a7', 'd7ff2827d8d7', '1c681eedce60', 'e7d8c1558029', '087d44b04db0', '31b0d64bed84',
  '496aeffa1513', 'e29f6535ffdd', 'a3f238326cdb', '1c2bfda6a9c1', 'fa83ceb8dcbf', 'c46f6b78c3e8',
  '32fa6a26a147', 'bc6aecd691e6', 'f53ae71881cf', '8176086943ff', 'd457a6b14402', 'f4ff3077ed87',
  'f3067c45ad41', '17707d40e8f7', '59236b233a61', 'd51199bd1bc5', '2876dc1a807c', 'd30762a0edb3',
  'd17ab8efbce2', 'e51251716f1e', '78a9c503135b', 'f957b9cb530e', '928bf67bcd20',
]);

test('no 24-box glyph is one of the net_draw originals, and each is plain stroke markup', async () => {
  const { createHash } = await import('node:crypto');
  const seen = new Map();
  for (const [key, part] of Object.entries(PARTS)) {
    if (!part.glyph) continue;
    const hash = createHash('sha1').update(part.glyph).digest('hex').slice(0, 12);
    assert.ok(!NET_DRAW_GLYPH_HASHES.has(hash), `${key} still carries the net_draw glyph`);
    assert.ok(!seen.has(part.glyph), `${key} shares its glyph with ${seen.get(part.glyph)}`);
    seen.set(part.glyph, key);
    const tags = [...part.glyph.matchAll(/<([a-z]+)/g)].map((m) => m[1]);
    assert.ok(tags.length > 0, `${key} has markup`);
    for (const t of tags) assert.ok(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text'].includes(t), `${key} uses <${t}>`);
    assert.ok(!/<(script|image|use|foreignObject)/i.test(part.glyph), `${key} glyph is inert`);
  }
  assert.equal(seen.size, 29);
});
