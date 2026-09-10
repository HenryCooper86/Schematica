import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, EXAMPLE_GROUPS } from '../src/examples.js';
import { diagramMarkup } from '../src/render.js';
import { serialize, deserialize } from '../src/serialize.js';
import { nodePart } from '../src/rdk/profiles.js';
import { getPart } from '../src/palette.js';
import { nodeRect } from '../src/geometry.js';
import { checkDoc } from '../src/drc.js';
import { parseCurrentMa, parseCapacityMah, powerSummary } from '../src/power.js';
import { presetsFor } from '../src/presets.js';

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
      const busOf = (ref) => nodePart(ex.doc.nodes.find((n) => n.id === ref.node))
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
  const stereo = rover.doc.nodes.find((n) => n.kind === 'depthcam' && n.sublabel === 'GS130W');
  assert.ok(stereo, 'rover carries the exact GS130W stereo module');
  assert.equal(rover.doc.wires.filter((w) => w.bus === 'mipi' && w.to.node === stereo.id).length, 2, 'stereo needs both host connectors');
  assert.ok(rover.doc.wires.some((w) => w.bus === 'mipi') && rover.doc.wires.some((w) => w.bus === 'canfd'), 'rover wires MIPI cameras and CAN FD');
  assert.ok(adas.doc.nodes.some((n) => n.kind === 'adas' && /Journey 6/.test(n.sublabel)), 'ADAS controller runs a Journey 6');
  assert.ok(adas.doc.nodes.some((n) => /Horizon/.test(n.notes)), 'a Horizon stack is named in the notes');
  assert.ok(adas.doc.wires.some((w) => w.bus === 'gmsl') && adas.doc.wires.some((w) => w.bus === 't1'), 'ADAS board wires GMSL cameras and T1 Ethernet');
});

// Current figures are only worth shipping where a real datasheet backs them,
// so the boards that carry them carry a few, and every value must be a figure
// the parser actually reads.
test('the boards that declare currents use field ids their part knows and figures the parser reads', () => {
  const declaring = new Set();
  for (const ex of EXAMPLES) {
    for (const n of ex.doc.nodes) {
      const ids = new Set((nodePart(n).fields || []).map((fd) => fd.id));
      for (const [id, value] of Object.entries(n.fields || {})) {
        assert.ok(ids.has(id), `${ex.id}/${n.id}: ${n.kind} has no field "${id}"`);
        if (id === 'ityp' || id === 'ipeak' || id === 'imax') {
          assert.notEqual(parseCurrentMa(value), null, `${ex.id}/${n.id}.${id} = "${value}"`);
          declaring.add(ex.id);
        }
        if (id === 'capacity') {
          assert.notEqual(parseCapacityMah(value), null, `${ex.id}/${n.id}.capacity = "${value}"`);
          declaring.add(ex.id);
        }
      }
    }
  }
  for (const id of ['weather-station', 'drone-fc', 'ev-bms']) assert.ok(declaring.has(id), `${id} shows the power budget`);
});

test('the weather station budgets its 3.3V rail and estimates how long the cell lasts', () => {
  const b = EXAMPLES.find((e) => e.id === 'weather-station');
  const rules = checkDoc(b.doc).filter((f) => f.rule.startsWith('power-') || f.rule === 'battery-runtime');
  // The LDO now states a 600 mA limit, which the 100 mA rail sits well inside,
  // so the only power line left is the measurement.
  assert.deepEqual(rules.map((f) => f.rule), ['battery-runtime']);
  // The charger passes the cell's rail through, so the runtime is measured
  // against what the regulator carries across, not against nothing. The word
  // "continuous" is what stops it contradicting the MCU's own deep-sleep note.
  assert.match(rules[0].message, /2000 mAh; at a continuous 100 mA that is about 20 h/);
  const rails = powerSummary(b.doc);
  const out = rails.find((r) => r.sources.includes('Regulator'));
  assert.equal(out.limitMa, 600);
  assert.equal(out.peakMa, 355, 'the ESP32 peak fits inside the LDO it is given');
});

test('the drone flight controller powers the sensors it draws, so their currents reach a rail', () => {
  const b = EXAMPLES.find((e) => e.id === 'drone-fc');
  const rail = powerSummary(b.doc).find((r) => r.sources.includes('BEC'));
  assert.deepEqual(rail.undeclared, [], 'every part on the BEC rail states what it draws');
  assert.equal(rail.typicalMa, 113.8, 'flight controller, IMU and GPS together');
  assert.equal(rail.limitMa, 3000);
  // A 3 A BEC carrying 114 mA is genuinely fine, so nothing is reported; the
  // Power tab is where that budget is now visible.
  assert.deepEqual(checkDoc(b.doc).filter((f) => f.rule.startsWith('power-')), []);
});

test('the EV BMS names the parts its 5V rail cannot account for', () => {
  const b = EXAMPLES.find((e) => e.id === 'ev-bms');
  const rules = checkDoc(b.doc).filter((f) => f.rule.startsWith('power-'));
  assert.deepEqual(rules.map((f) => f.rule), ['power-budget-unknown-parts'],
    'the buck states a limit now, so what is left is the silent parts');
  assert.equal(rules[0].level, 'info');
  const rail = powerSummary(b.doc).find((r) => r.sources.includes('12 V to 5 V'));
  assert.equal(rail.limitMa, 1000);
  assert.equal(rail.undeclared.length, 4);
  // The pyro fuse's rating is on the board, and no rule fires on it because
  // nothing on the HV rail says what it draws.
  const hv = powerSummary(b.doc).find((r) => r.passes.length);
  assert.deepEqual(hv.passes, [{ label: 'Pyro fuse', limitMa: 500000 }]);
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

// Animate is off when a board opens; an example's wires must not flow until
// the user turns it on (no wire authored with flow "on"). Adversary glows are
// the one motion that ignores the toggle, like net_draw's effect halos.
test('no example wire flows while the Animate toggle is off', () => {
  for (const ex of EXAMPLES) {
    const m = diagramMarkup(ex.doc, { selection: new Set(), animate: false, ports: false });
    assert.ok(!/class="vis anim"/.test(m), `${ex.id} has wires flowing with the toggle off`);
    assert.ok(!/class="blink"/.test(m), `${ex.id} has tags blinking with the toggle off`);
    assert.deepEqual(ex.doc.wires.filter((w) => w.flow === 'on').map((w) => w.id), [], `${ex.id} ships wires forced on`);
  }
});

// The menu groups boards by topic so twenty-one entries stay scannable.
test('every example belongs to one of the menu groups and no group is empty', () => {
  assert.deepEqual(EXAMPLE_GROUPS, ['Embedded', 'Vehicle', 'Security']);
  for (const ex of EXAMPLES) assert.ok(EXAMPLE_GROUPS.includes(ex.group), `${ex.id} group "${ex.group}"`);
  for (const g of EXAMPLE_GROUPS) assert.ok(EXAMPLES.some((ex) => ex.group === g), `${g} has boards`);
});

test('the Mono 2 board is an all-in-one front camera on a Journey 2 feeding the vehicle CAN', () => {
  const b = EXAMPLES.find((e) => e.id === 'mono2-adas');
  assert.ok(b, 'board exists');
  assert.equal(b.name, 'Mono 2 Front-Camera ADAS (Horizon)');
  assert.equal(b.group, 'Vehicle');
  const ecu = b.doc.nodes.find((n) => n.kind === 'adas');
  assert.equal(ecu.sublabel, 'Mono 2');
  assert.match(ecu.notes, /Journey 2/);
  assert.equal(b.doc.wires.filter((w) => w.bus === 'gmsl').length, 1, 'a single imager');
  assert.equal(b.doc.nodes.filter((n) => n.kind === 'frontcam').length, 1);
  assert.ok(!b.doc.nodes.some((n) => n.kind === 'radar'), 'vision only');
  const gw = b.doc.nodes.find((n) => n.kind === 'vgateway');
  assert.ok(b.doc.wires.some((w) => w.bus === 'canfd' && w.from.node === ecu.id && w.to.node === gw.id), 'ECU to gateway over CAN FD');
  const ecus = b.doc.nodes.filter((n) => n.kind === 'mcu');
  assert.ok(ecus.length >= 2, 'brake and steering ECUs');
  for (const n of ecus) assert.ok(b.doc.wires.some((w) => w.bus === 'can' && w.from.node === gw.id && w.to.node === n.id), `${n.label} hangs off the gateway CAN`);
  assert.ok(b.doc.nodes.some((n) => n.kind === 'obd'));
  assert.deepEqual(new Set(checkDoc(b.doc).map((f) => f.rule)), new Set(['unconnected-power']), 'only undrawn ECU supplies remain');
  assert.ok(b.doc.journey.length >= 3);
});

test('the HSD 600 board carries eleven cameras in four clusters, three radars, and a T1 backbone on a Journey 6P', () => {
  const b = EXAMPLES.find((e) => e.id === 'hsd600-adas');
  assert.ok(b, 'board exists');
  assert.equal(b.name, 'SuperDrive HSD 600 Urban NOA (Horizon)');
  assert.equal(b.group, 'Vehicle');
  const dc = b.doc.nodes.find((n) => n.kind === 'adas');
  assert.equal(dc.sublabel, 'HSD 600');
  assert.match(dc.notes, /Journey 6P/);
  const clusters = b.doc.nodes.filter((n) => n.kind === 'frontcam');
  assert.equal(clusters.length, 4);
  assert.equal(clusters.reduce((sum, n) => sum + Number(/x(\d+)/.exec(n.sublabel)[1]), 0), 11, 'cluster sizes add up to the HSD 600 camera count');
  const gmsl = b.doc.wires.filter((w) => w.bus === 'gmsl');
  assert.deepEqual(new Set(gmsl.map((w) => w.to.port)), new Set(['cam1', 'cam2', 'cam3', 'cam4']));
  assert.deepEqual(new Set(gmsl.map((w) => w.from.node)), new Set(clusters.map((n) => n.id)));
  const radars = b.doc.nodes.filter((n) => n.kind === 'radar');
  assert.equal(radars.length, 3);
  assert.ok(radars.some((r) => b.doc.wires.some((w) => w.bus === 'canfd' && w.from.node === r.id && w.to.node === dc.id)), 'front radar on CAN FD');
  const sw = b.doc.nodes.find((n) => n.kind === 't1switch');
  assert.equal(radars.filter((r) => b.doc.wires.some((w) => w.bus === 't1' && w.from.node === r.id && w.to.node === sw.id)).length, 2, 'corner radars on T1');
  assert.ok(b.doc.wires.some((w) => w.bus === 't1' && w.from.node === dc.id && w.to.node === sw.id), 'controller on the T1 switch');
  assert.ok(b.doc.nodes.some((n) => n.kind === 'vgateway') && b.doc.nodes.some((n) => n.kind === 'obd'));
  assert.deepEqual(new Set(checkDoc(b.doc).map((f) => f.rule)), new Set(['unconnected-power']), 'only undrawn sensor supplies remain');
  assert.ok(b.doc.journey.length >= 3);
});

test('every vendor board names its headline part exactly as the preset does, so the Part number datalist matches', () => {
  const boards = [
    ['rdk-rover', 'aisbc', 'RDK X5'], ['rdk-perception', 'aisbc', 'RDK X5'],
    ['rdk-x3-robot', 'aisbc', 'RDK X3'], ['rdk-s100-node', 'aisbc', 'RDK S100'],
    ['mono2-adas', 'adas', 'Mono 2'], ['hsd600-adas', 'adas', 'HSD 600'],
  ];
  for (const [id, kind, sublabel] of boards) {
    const b = EXAMPLES.find((e) => e.id === id);
    assert.ok(b, id);
    assert.ok(b.doc.nodes.some((n) => n.kind === kind && n.sublabel === sublabel), `${id} has a ${kind} "${sublabel}"`);
    assert.ok(presetsFor(kind).some((p) => p.sublabel === sublabel), `${sublabel} is a ${kind} preset`);
  }
});
