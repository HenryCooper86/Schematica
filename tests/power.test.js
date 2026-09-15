import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCurrentMa, parseCapacityMah, formatCurrent, formatCapacity, formatHours,
  busComponents, railVertex, powerRails, runtimeHours, declaredTypicalMa, powerSummary,
} from '../src/power.js';
import { PARTS } from '../src/palette.js';

const node = (id, kind, fields) => ({
  id, kind, x: 0, y: 0, label: id, sublabel: '', color: null,
  addr: '', rail: '', notes: '', status: null, flags: [], ...(fields ? { fields } : {}),
});
const wire = (id, bus, a, ap, b, bp) => ({
  id, bus, from: { node: a, port: ap }, to: { node: b, port: bp },
  label: '', arrow: null, style: null, flow: null,
});
const doc = (nodes, wires) => ({ schema: 2, title: 'T', nodes, wires, zones: [], notes: [], journey: [] });
const rail = (rails, sourceId) => rails.find((r) => r.sources.some((s) => s.node.id === sourceId));

test('a current is read the way a datasheet line is written', () => {
  assert.equal(parseCurrentMa('250mA'), 250);
  assert.equal(parseCurrentMa('0.25 A'), 250);
  assert.equal(parseCurrentMa('250 ma'), 250);
  assert.equal(parseCurrentMa('1.2A'), 1200);
  assert.equal(parseCurrentMa('250'), 250, 'a bare number is milliamps');
  assert.equal(parseCurrentMa('  80 MA  '), 80);
  assert.equal(parseCurrentMa('.5A'), 500);
  assert.equal(parseCurrentMa('0'), 0, 'zero is a figure, not a blank');
});

test('microamps are read in all three spellings and kilo-amps scale too', () => {
  for (const s of ['3.6uA', '3.6µA', '3.6μA']) assert.equal(parseCurrentMa(s), 0.0036, s);
  assert.equal(parseCurrentMa('2kA'), 2e6);
});

test('a capacity is its own unit and never reads as a current', () => {
  assert.equal(parseCapacityMah('2000mAh'), 2000);
  assert.equal(parseCapacityMah('2 Ah'), 2000);
  assert.equal(parseCapacityMah('40Ah'), 40000);
  assert.equal(parseCapacityMah('2000'), 2000, 'a bare number is milliamp-hours');
  assert.equal(parseCurrentMa('2000mAh'), null, 'a capacity is not a current');
  assert.equal(parseCapacityMah('250mA'), null, 'a current is not a capacity');
});

test('anything that is not a figure reads as null, and nothing throws', () => {
  for (const bad of ['', '   ', 'lots', '12V', '250m', '-5mA', '3 A 4', 'about 80mA', '0x76',
    null, undefined, {}, [], NaN, Infinity, true]) {
    assert.equal(parseCurrentMa(bad), null, JSON.stringify(bad));
    assert.equal(parseCapacityMah(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseCurrentMa(250), 250, 'a number is taken as milliamps');
});

test('figures print in the unit a reader expects', () => {
  assert.equal(formatCurrent(0.0036), '3.6 µA');
  assert.equal(formatCurrent(0.72), '720 µA');
  assert.equal(formatCurrent(355), '355 mA');
  assert.equal(formatCurrent(100.0036), '100 mA', 'a microamp part does not add noise to a rail total');
  assert.equal(formatCurrent(1240), '1.24 A');
  assert.equal(formatCurrent(0), '0 mA');
  assert.equal(formatCurrent(null), '');
  assert.equal(formatCapacity(2000), '2000 mAh');
  assert.equal(formatCapacity(40000), '40 Ah');
  assert.equal(formatHours(19.999), '20');
  assert.equal(formatHours(2.86), '2.9');
  assert.equal(formatHours(null), '');
  assert.equal(runtimeHours(2000, 100), 20);
  assert.equal(runtimeHours(2000, 0), null, 'no load is not an infinite runtime');
  assert.equal(runtimeHours(null, 100), null);
});

test('busComponents groups the wires of one bus and ignores the others', () => {
  const d = doc(
    [node('m', 'mcu'), node('a', 'temp'), node('b', 'tof'), node('c', 'rtc')],
    [wire('w1', 'i2c', 'm', 'i2c', 'a', 'i2c'), wire('w2', 'i2c', 'b', 'i2c', 'c', 'i2c'),
      wire('w3', 'spi', 'm', 'spi', 'b', 'i2c')],
  );
  const groups = busComponents(d, 'i2c').map((g) => g.sort());
  assert.equal(groups.length, 2);
  assert.ok(groups.some((g) => g.join() === 'a,m'));
  assert.ok(groups.some((g) => g.join() === 'b,c'));
  assert.deepEqual(busComponents(d, 'can'), []);
});

test('a power pin belongs to the supply side, the draw side, or a pass-through', () => {
  assert.equal(railVertex(PARTS.battery, 'n1', 'out'), railVertex(PARTS.battery, 'n1', 'out'));
  assert.notEqual(railVertex(PARTS.regulator, 'n1', 'in'), railVertex(PARTS.regulator, 'n1', 'out'));
  assert.equal(railVertex(PARTS.fuse, 'n1', 'in'), railVertex(PARTS.fuse, 'n1', 'out'), 'a fuse is one rail');
  assert.equal(railVertex(PARTS.fusebox, 'n1', 'out1'), railVertex(PARTS.fusebox, 'n1', 'out3'));
});

test('a regulator separates its input rail from its output rail', () => {
  const d = doc(
    [node('bat', 'battery'), node('reg', 'regulator'), node('mcu', 'mcu', { ityp: '100mA' })],
    [wire('w1', 'power', 'bat', 'out', 'reg', 'in'), wire('w2', 'power', 'reg', 'out', 'mcu', 'vcc')],
  );
  const rails = powerRails(d);
  assert.equal(rails.length, 2);
  const input = rail(rails, 'bat');
  const output = rail(rails, 'reg');
  assert.deepEqual(input.draws.map((e) => e.node.id), ['reg'], 'the regulator draws on the battery rail');
  assert.deepEqual(output.draws.map((e) => e.node.id), ['mcu']);
  assert.equal(output.typicalMa, 100);
  assert.equal(input.typicalMa, 100, 'the load carries across the regulator unchanged');
  assert.equal(input.declaredDraw, false, 'a carried figure is not a declared one');
});

test('a regulator that states its own current adds it to the load it carries, never replaces it', () => {
  const d = doc(
    [node('bat', 'battery'), node('reg', 'regulator', { ityp: '60mA', imax: '500mA' }), node('mcu', 'mcu', { ityp: '100mA' })],
    [wire('w1', 'power', 'bat', 'out', 'reg', 'in'), wire('w2', 'power', 'reg', 'out', 'mcu', 'vcc')],
  );
  const rails = powerRails(d);
  assert.equal(rail(rails, 'reg').typicalMa, 100);
  assert.equal(rail(rails, 'bat').typicalMa, 160, 'the quiescent current is on top of what the rail carries');
  assert.equal(rail(rails, 'bat').declaredDraw, true, 'the regulator did declare something of its own');
});

test('a quiescent current on a regulator cannot zero the rail that feeds it', () => {
  // The repro: a sleeping LDO states 55 uA, and the battery rail must still
  // see everything the LDO is delivering rather than the 55 uA alone.
  const d = doc(
    [node('bat', 'battery', { capacity: '2000mAh' }), node('buck', 'regulator', { imax: '1A' }),
      node('ldo', 'regulator', { imax: '600mA', ityp: '55uA' }),
      node('mcu', 'mcu', { ityp: '120mA' }), node('radio', 'wifi', { ityp: '80mA' })],
    [wire('w1', 'power', 'bat', 'out', 'buck', 'in'), wire('w2', 'power', 'buck', 'out', 'ldo', 'in'),
      wire('w3', 'power', 'ldo', 'out', 'mcu', 'vcc'), wire('w4', 'power', 'ldo', 'out', 'radio', 'vcc')],
  );
  const rails = powerRails(d);
  assert.equal(rail(rails, 'ldo').typicalMa, 200);
  assert.equal(rail(rails, 'buck').typicalMa, 200.055);
  assert.equal(rail(rails, 'bat').typicalMa, 200.055);
  assert.equal(formatHours(runtimeHours(2000, rail(rails, 'bat').typicalMa)), '10');
});

test('a regulator with a declared current whose own rail cannot be summed still reports it', () => {
  const d = doc(
    [node('bat', 'battery'), node('reg', 'regulator', { ityp: '55uA' }), node('mcu', 'mcu')],
    [wire('w1', 'power', 'bat', 'out', 'reg', 'in'), wire('w2', 'power', 'reg', 'out', 'mcu', 'vcc')],
  );
  const rails = powerRails(d);
  assert.equal(rail(rails, 'bat').typicalMa, 0.055, 'nothing downstream stated a figure, so only its own is known');
  assert.equal(rail(rails, 'bat').unknown, 1, 'the regulator cannot account for its downstream load');
  assert.equal(rail(rails, 'reg').unknown, 1);
});

test('a fuse or fuse box carries one rail straight through', () => {
  const d = doc(
    [node('bat', 'battery', { imax: '2A' }), node('f', 'fusebox'),
      node('a', 'mcu', { ityp: '100mA' }), node('b', 'servo', { ityp: '300mA' })],
    [wire('w1', 'power', 'bat', 'out', 'f', 'in'), wire('w2', 'power', 'f', 'out1', 'a', 'vcc'),
      wire('w3', 'power', 'f', 'out2', 'b', 'vcc')],
  );
  const rails = powerRails(d);
  assert.equal(rails.length, 1);
  assert.deepEqual(rails[0].draws.map((e) => e.node.id).sort(), ['a', 'b']);
  assert.equal(rails[0].typicalMa, 400);
  assert.equal(rails[0].unknown, 0, 'the fuse box itself is neither a source nor a load');
});

test('peaks fall back to the typical figure and unstated parts are counted, not assumed', () => {
  const d = doc(
    [node('reg', 'regulator', { imax: '1A' }), node('a', 'mcu', { ityp: '100mA', ipeak: '350mA' }),
      node('b', 'wifi', { ityp: '80mA' }), node('c', 'led')],
    [wire('w1', 'power', 'reg', 'out', 'a', 'vcc'), wire('w2', 'power', 'reg', 'out', 'b', 'vcc'),
      wire('w3', 'power', 'reg', 'out', 'c', 'vcc')],
  );
  const [r] = powerRails(d);
  assert.equal(r.typicalMa, 180);
  assert.equal(r.peakMa, 430, 'a part with no peak contributes its typical current');
  assert.equal(r.unknown, 1);
  assert.equal(r.declaredLimit, true);
});

test('a rail nobody has given a figure to is not part of the budget', () => {
  const d = doc(
    [node('bat', 'battery'), node('mcu', 'mcu')],
    [wire('w1', 'power', 'bat', 'out', 'mcu', 'vcc')],
  );
  const [r] = powerRails(d);
  assert.equal(r.declared, false);
  assert.equal(r.unknown, 1);
});

test('a ring of regulators stops instead of recursing forever', () => {
  const d = doc(
    [node('r1', 'regulator'), node('r2', 'regulator')],
    [wire('w1', 'power', 'r1', 'out', 'r2', 'in'), wire('w2', 'power', 'r2', 'out', 'r1', 'in')],
  );
  const rails = powerRails(d);
  assert.equal(rails.length, 2);
  for (const r of rails) assert.equal(r.typicalMa, 0);
});

test('a wire onto a node the board no longer has builds no rail', () => {
  const d = doc(
    [node('bat', 'battery', { imax: '1A' })],
    [wire('w1', 'power', 'bat', 'out', 'ghost', 'vcc')],
  );
  assert.deepEqual(powerRails(d), []);
});

test('a pass-through part stays on the rail it carries, with its rating', () => {
  const d = doc(
    [node('bat', 'battery', { imax: '2A' }), node('f', 'fuse', { imax: '1A' }), node('a', 'mcu', { ityp: '100mA' })],
    [wire('w1', 'power', 'bat', 'out', 'f', 'in'), wire('w2', 'power', 'f', 'out', 'a', 'vcc')],
  );
  const [r] = powerRails(d);
  assert.deepEqual(r.passes.map((p) => p.node.id), ['f']);
  assert.equal(r.passes[0].currents.limitMa, 1000);
  assert.deepEqual(r.draws.map((e) => e.node.id), ['a'], 'the fuse is still not a load');
  assert.equal(r.typicalMa, 100);
});

test('the limits of every supply on a rail add up, and say when the sum is partial', () => {
  const both = doc(
    [node('r1', 'regulator', { imax: '500mA' }), node('r2', 'regulator', { imax: '500mA' }), node('m', 'mcu', { ityp: '600mA' })],
    [wire('w1', 'power', 'r1', 'out', 'm', 'vcc'), wire('w2', 'power', 'r2', 'out', 'm', 'vcc')],
  );
  const [r] = powerRails(both);
  assert.equal(r.sources.length, 2);
  assert.equal(r.limitMa, 1000);
  assert.equal(r.limitComplete, true);
  const partial = doc(
    [node('r1', 'regulator', { imax: '500mA' }), node('r2', 'regulator'), node('m', 'mcu', { ityp: '600mA' })],
    [wire('w1', 'power', 'r1', 'out', 'm', 'vcc'), wire('w2', 'power', 'r2', 'out', 'm', 'vcc')],
  );
  const [p] = powerRails(partial);
  assert.equal(p.limitMa, 500);
  assert.equal(p.limitComplete, false, 'one supply said nothing, so the sum bounds nothing');
});

test('unknown draws are named, not only counted', () => {
  const d = doc(
    [node('reg', 'regulator', { imax: '1A' }), node('a', 'mcu', { ityp: '100mA' }), node('b', 'led'), node('c', 'buzzer')],
    [wire('w1', 'power', 'reg', 'out', 'a', 'vcc'), wire('w2', 'power', 'reg', 'out', 'b', 'vcc'),
      wire('w3', 'power', 'reg', 'out', 'c', 'vcc')],
  );
  const [r] = powerRails(d);
  assert.deepEqual(r.unknownIds, ['b', 'c']);
  assert.equal(r.unknown, 2);
});

test('powerSummary lists every rail as something to read, judging nothing', () => {
  const d = doc(
    [node('bat', 'battery', { capacity: '2000mAh' }), node('f', 'fuse', { imax: '2A' }),
      node('reg', 'regulator', { imax: '600mA' }), node('mcu', 'mcu', { ityp: '100mA', ipeak: '355mA' }), node('led', 'led')],
    [wire('w1', 'power', 'bat', 'out', 'f', 'in'), wire('w2', 'power', 'f', 'out', 'reg', 'in'),
      wire('w3', 'power', 'reg', 'out', 'mcu', 'vcc'), wire('w4', 'power', 'reg', 'out', 'led', 'vcc')],
  );
  const rows = powerSummary(d);
  assert.equal(rows.length, 2);
  const cell = rows.find((r) => r.sources.includes('bat'));
  assert.deepEqual(cell.passes, [{ label: 'f', limitMa: 2000 }]);
  assert.equal(cell.typicalMa, 100);
  assert.equal(cell.runtimes.length, 0, 'unknown downstream draw prevents a runtime estimate');
  assert.deepEqual(cell.ids.sort(), ['bat', 'f', 'reg']);
  const out = rows.find((r) => r.sources.includes('reg'));
  assert.equal(out.limitMa, 600);
  assert.equal(out.limitComplete, true);
  assert.equal(out.peakMa, 355);
  assert.deepEqual(out.undeclared, ['led']);
  assert.deepEqual(out.runtimes, [], 'a regulator stores nothing');
});

test('powerSummary shows a rail nobody has given a figure to as undeclared, not as zero', () => {
  const d = doc(
    [node('bat', 'battery'), node('mcu', 'mcu')],
    [wire('w1', 'power', 'bat', 'out', 'mcu', 'vcc')],
  );
  const [row] = powerSummary(d);
  assert.equal(row.declared, false);
  assert.equal(row.summed, false, 'no total at all is not a total of zero');
  assert.equal(row.limitMa, null);
  assert.deepEqual(row.undeclared, ['mcu']);
});

test('powerSummary counts a rail as summed when a figure was carried up from below', () => {
  // The battery rail declares nothing of its own; what the regulator carries
  // across is still a real number and the tree must show it.
  const d = doc(
    [node('bat', 'battery'), node('reg', 'regulator'), node('mcu', 'mcu', { ityp: '87mA' })],
    [wire('w1', 'power', 'bat', 'out', 'reg', 'in'), wire('w2', 'power', 'reg', 'out', 'mcu', 'vcc')],
  );
  const up = powerSummary(d).find((r) => r.sources.includes('bat'));
  assert.equal(up.declared, false, 'nothing on this rail opted into the checks');
  assert.equal(up.summed, true);
  assert.equal(up.typicalMa, 87);
});

test('a USB port heads a rail and a customized regulator keeps heading its own', () => {
  assert.notEqual(railVertex(PARTS.usbport, 'u1', 'vbus'), railVertex(PARTS.usbport, 'u1', 'usb'));
  const d = doc(
    [node('usb', 'usbport', { imax: '500mA' }), node('mcu', 'mcu', { ityp: '120mA' })],
    [wire('w1', 'power', 'usb', 'vbus', 'mcu', 'vcc')],
  );
  const [r] = powerRails(d);
  assert.deepEqual(r.sources.map((s) => s.node.id), ['usb']);
  assert.equal(r.limitMa, 500);
  assert.equal(r.typicalMa, 120);
});

test('declaredTypicalMa counts every part, wired to a rail or not', () => {
  assert.equal(declaredTypicalMa([node('a', 'mcu', { ityp: '100mA' }), node('b', 'imu', { ipeak: '5mA' }), node('c', 'led')]), 105);
  assert.equal(declaredTypicalMa([node('c', 'led')]), null, 'a board that states nothing has no total');
});

test('unknown downstream loads remain incomplete upstream and suppress runtime estimates', () => {
  const d = doc([
    node('b', 'battery', { capacity: '2000mAh', imax: '1A' }),
    node('r', 'regulator', { ityp: '5mA', imax: '1A' }),
    node('known', 'mcu', { ityp: '100mA' }), node('missing', 'temp'),
  ], [wire('a', 'power', 'b', 'out', 'r', 'in'),
    wire('c', 'power', 'r', 'out', 'known', 'vcc'),
    wire('d', 'power', 'r', 'out', 'missing', 'vcc')]);
  const upstream = rail(powerRails(d), 'b');
  assert.equal(upstream.typicalMa, 105);
  assert.equal(upstream.unknown, 1);
  assert.equal(upstream.known, true);
  assert.deepEqual(upstream.unknownIds, ['r']);
  assert.deepEqual(powerSummary(d).find(r => r.sources.includes('b')).runtimes, []);
});

test('zero output limit is a declared rating, not an unknown rating', () => {
  const d = doc([node('b', 'battery', { imax: '0mA' }), node('m', 'mcu', { ityp: '10mA' })],
    [wire('w', 'power', 'b', 'out', 'm', 'vcc')]);
  const r = powerRails(d)[0];
  assert.equal(r.limitMa, 0);
  assert.equal(r.limitComplete, true);
});

test('unit scaling never returns an infinite current or capacity', () => {
  const huge = '9'.repeat(308);
  assert.equal(parseCurrentMa(huge + 'kA'), null);
  assert.equal(parseCapacityMah(huge + 'kAh'), null);
});

test('cyclic power totals do not depend on which rail is requested first', () => {
  const d = doc([node('a', 'regulator', { ityp: '1mA' }), node('b', 'regulator', { ityp: '2mA' }),
    node('m', 'mcu', { ityp: '3mA' })],
  [wire('ab', 'power', 'a', 'out', 'b', 'in'), wire('ba', 'power', 'b', 'out', 'a', 'in'),
    wire('am', 'power', 'a', 'out', 'm', 'vcc')]);
  const totals = () => Object.fromEntries(powerRails(d).map(r => [r.sources[0].node.id, r.typicalMa]));
  const first = totals();
  d.wires.reverse();
  assert.deepEqual(totals(), first);
  assert.deepEqual(first, { a: 6, b: 6 });
});

test('Check and BOM also withhold runtime for incomplete loads', async () => {
  const { checkDoc } = await import('../src/drc.js');
  const { bomSummary } = await import('../src/bom.js');
  const d = doc([node('b', 'battery', { capacity: '2000mAh', imax: '0mA' }),
    node('known', 'mcu', { ityp: '100mA' }), node('missing', 'temp')],
  [wire('a', 'power', 'b', 'out', 'known', 'vcc'), wire('c', 'power', 'b', 'out', 'missing', 'vcc')]);
  const findings = checkDoc(d);
  assert.ok(findings.some(f => f.rule === 'power-budget' && f.level === 'error'));
  assert.ok(!findings.some(f => f.rule === 'battery-runtime'));
  assert.ok(!bomSummary(d).some(line => line.includes(' h at ')));
});

test('converter voltage and efficiency scale downstream load while keeping quiescent current', () => {
  const d=doc([node('bat','battery'),node('reg','regulator',{ityp:'5mA'}),node('load','mcu',{ityp:'100mA'})],
    [wire('w1','power','bat','out','reg','in'),wire('w2','power','reg','out','load','vcc')]);
  d.nodes[1].budget={inputV:12,outputV:3.3,efficiency:90};
  assert.ok(Math.abs(rail(powerRails(d),'bat').typicalMa-(5+100*3.3/12/0.9))<1e-9);
});
test('operating modes and explicit noncoincident peaks use their stated assumptions', () => {
  const d=doc([node('bat','battery'),node('a','mcu'),node('b','temp')],
    [wire('wa','power','bat','out','a','vcc'),wire('wb','power','bat','out','b','vcc')]);
  d.nodes[1].budget={activeMa:100,sleepMa:1,activePeakMa:200,dutyPercent:10};
  d.nodes[2].budget={activeMa:20,sleepMa:2,activePeakMa:50,dutyPercent:50};
  d.engineering={budget:{mode:'average',peaks:'simultaneous'}};
  let r=powerRails(d)[0];assert.ok(Math.abs(r.typicalMa-21.9)<1e-9);assert.equal(r.peakMa,250);
  d.engineering.budget={mode:'active',peaks:'noncoincident'};
  r=powerRails(d)[0];assert.equal(r.typicalMa,120);assert.equal(r.peakMa,220);
  d.engineering.budget.mode='sleep';assert.equal(powerRails(d)[0].typicalMa,3);
});
