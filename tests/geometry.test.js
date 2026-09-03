import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, nodeSize, nodeMeta, portPosition, wireGeom, wireGeomToPoint, curvePoint, wireLanes, WIRE_FAN,
  rectContains, rectsIntersect, normRect, wrapText, noteHeight, NOTE_W, contentBounds,
} from '../src/geometry.js';

const node = { x: 100, y: 200, w: 160, h: 100 };

test('snap rounds to grid', () => {
  assert.equal(snap(11), 8);
  assert.equal(snap(12), 16);
  assert.equal(snap(-3), 0);
  assert.equal(snap(25, 10), 30);
});

test('portPosition on each side', () => {
  assert.deepEqual(portPosition(node, { side: 'left', offset: 0.5 }), { x: 100, y: 250 });
  assert.deepEqual(portPosition(node, { side: 'right', offset: 0.5 }), { x: 260, y: 250 });
  assert.deepEqual(portPosition(node, { side: 'top', offset: 0.25 }), { x: 140, y: 200 });
  assert.deepEqual(portPosition(node, { side: 'bottom', offset: 1 }), { x: 260, y: 300 });
});

// net_draw edge geometry: each end sits on the card boundary (5px out) along
// the ray toward the other card's center; the cubic bends along the dominant
// axis only, so a wire always leaves and enters straight.
test('wireGeom anchors on the facing card edges and runs straight between aligned cards', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const b = { x: 400, y: 0, w: 160, h: 100 };
  const g = wireGeom(a, b);
  assert.deepEqual(g.p1, { x: 165, y: 50 });
  assert.deepEqual(g.p2, { x: 395, y: 50 });
  assert.equal(g.d, 'M 165 50 C 257 50, 303 50, 395 50');
  assert.deepEqual(g.mid, { x: 280, y: 50 });
});

test('wireGeom bends along the dominant axis', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const below = { x: 0, y: 300, w: 100, h: 50 };
  const g = wireGeom(a, below);
  assert.deepEqual(g.p1, { x: 50, y: 55 }, 'leaves the bottom edge');
  assert.deepEqual(g.p2, { x: 50, y: 295 }, 'enters the top edge');
  assert.equal(g.c1.x, g.p1.x, 'vertical run: control points keep x');
  assert.equal(g.c2.x, g.p2.x);
  const diag = wireGeom(a, { x: 300, y: 60, w: 100, h: 50 });
  assert.equal(diag.c1.y, diag.p1.y, 'horizontal-dominant run: control points keep y');
  assert.ok(diag.p1.x > 100 && diag.p1.x <= 105, 'exits through the right edge');
});

test('wireGeom offset displaces the whole curve sideways for parallel wires', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const b = { x: 400, y: 0, w: 160, h: 100 };
  const up = wireGeom(a, b, -11);
  const down = wireGeom(a, b, 11);
  assert.deepEqual(up.p1, { x: 165, y: 39 });
  assert.deepEqual(down.p1, { x: 165, y: 61 });
  assert.notEqual(up.d, down.d);
});

test('wireGeomToPoint ends exactly at the cursor', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const g = wireGeomToPoint(a, { x: 500, y: 50 });
  assert.deepEqual(g.p1, { x: 165, y: 50 });
  assert.deepEqual(g.p2, { x: 500, y: 50 });
});

test('curvePoint walks the cubic from p1 to p2 through mid', () => {
  const g = wireGeom({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 200, w: 100, h: 50 });
  assert.deepEqual(curvePoint(g, 0), g.p1);
  assert.deepEqual(curvePoint(g, 1), g.p2);
  assert.deepEqual(curvePoint(g, 0.5), g.mid);
});

test('wireLanes fans wires that share a node pair and centers the fan', () => {
  const wires = [
    { id: 'w1', from: { node: 'a' }, to: { node: 'b' } },
    { id: 'w2', from: { node: 'b' }, to: { node: 'a' } },
    { id: 'w3', from: { node: 'a' }, to: { node: 'c' } },
    { id: 'w4', from: { node: 'a' }, to: { node: 'b' } },
  ];
  const lanes = wireLanes(wires);
  assert.equal(lanes.get('w3'), 0, 'a lone wire runs down the middle');
  assert.deepEqual([lanes.get('w1'), lanes.get('w2'), lanes.get('w4')], [-WIRE_FAN, 0, WIRE_FAN]);
});

test('rect helpers', () => {
  assert.ok(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 }));
  assert.ok(!rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 5 }));
  assert.ok(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }));
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
});

// net_draw card sizing: 104x74 at minimum, wider for long labels (capped at
// 240), 12.5px taller per meta line. Stored sizes are gone; nodeRect derives.
test('nodeSize follows the content like net_draw', () => {
  assert.deepEqual(nodeSize({ label: 'MCU' }), { w: 104, h: 74 });
  assert.deepEqual(nodeSize({ label: 'MCU', sublabel: 'ESP32-S3', addr: '0x76' }), { w: 104, h: 99 });
  assert.deepEqual(nodeSize({ label: 'MCU', sublabel: 'a', addr: 'b', rail: 'c' }), { w: 104, h: 111.5 });
  assert.equal(nodeSize({ label: 'Flight controller unit' }).w, 22 * 6.8 + 24, 'label widens the card');
  assert.equal(nodeSize({ label: 'x', sublabel: 'y'.repeat(20) }).w, 20 * 5.9 + 26, 'meta lines widen it too');
  assert.equal(nodeSize({ label: 'x'.repeat(80) }).w, 240, 'width is capped');
  assert.deepEqual(nodeMeta({ label: 'a', sublabel: ' ', addr: '0x1', rail: '' }), [{ field: 'addr', text: '0x1' }], 'blank meta lines are skipped');
  assert.deepEqual(nodeRect({ x: 10, y: 20, label: 'MCU' }), { x: 10, y: 20, w: 104, h: 74 });
});

test('wrapText wraps at maxChars and never returns empty', () => {
  assert.deepEqual(wrapText('short'), ['short']);
  const lines = wrapText('one two three four five six seven eight nine ten', 12);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 12 || !l.includes(' '));
  assert.deepEqual(wrapText(''), ['']);
});

test('noteHeight grows with lines', () => {
  assert.equal(noteHeight('short'), 32);
  assert.ok(noteHeight('a very long note that definitely wraps onto multiple lines for sure') > 32);
});

test('contentBounds covers nodes, zones, notes; null when empty', () => {
  const doc = {
    nodes: [{ x: 100, y: 100, w: 50, h: 50 }],
    zones: [{ x: 0, y: 0, w: 80, h: 80 }],
    notes: [{ x: 200, y: 10, text: 'hi' }],
    wires: [],
  };
  const b = contentBounds(doc);
  assert.equal(b.x, 0);
  assert.equal(b.y, 0);
  assert.equal(b.w, 200 + NOTE_W);
  assert.ok(b.h >= 150);
  assert.equal(contentBounds({ nodes: [], zones: [], notes: [], wires: [] }), null);
});

test('laneSnapPoint pulls the cross-axis onto lane centerlines inside a swimlane', async () => {
  const { laneSnapPoint, LANE_TITLE_H } = await import('../src/geometry.js');
  const doc = {
    zones: [{
      id: 'z1', x: 0, y: 0, w: 300, h: LANE_TITLE_H + 300, label: 'P', color: '#a78bfa',
      kind: 'swimlane', orient: 'h', lanes: ['A', 'B', 'C'],
    }],
  };
  // Lane centerlines at LANE_TITLE_H + 50/150/250.
  const c1 = LANE_TITLE_H + 50;
  assert.deepEqual(laneSnapPoint(doc, 100, c1 + 10), { x: 100, y: c1 }, 'within threshold snaps');
  assert.deepEqual(laneSnapPoint(doc, 100, c1 + 40), { x: 100, y: c1 + 40 }, 'beyond threshold stays');
  assert.deepEqual(laneSnapPoint(doc, 100, LANE_TITLE_H - 4), { x: 100, y: LANE_TITLE_H - 4 }, 'title band never snaps');
  assert.deepEqual(laneSnapPoint(doc, 999, c1 + 10), { x: 999, y: c1 + 10 }, 'outside the swimlane stays');
  doc.zones[0].orient = 'v';
  assert.deepEqual(laneSnapPoint(doc, 58, 200), { x: 50, y: 200 }, 'vertical lanes snap x');
  const plain = { zones: [{ id: 'z2', x: 0, y: 0, w: 300, h: 300, label: 'Z', color: '#4a90d9' }] };
  assert.deepEqual(laneSnapPoint(plain, 100, 100), { x: 100, y: 100 }, 'plain zones never snap');
});

// Zone resize handles (net_draw's corner handles): the corner opposite the
// dragged one stays fixed, sizes never drop below the minimum, and dragging
// past the fixed corner flips the rectangle instead of inverting it.
test('resizeZone keeps the opposite corner fixed and enforces minimum sizes', async () => {
  const { resizeZone } = await import('../src/geometry.js');
  const z = { x: 100, y: 100, w: 200, h: 150 };
  assert.deepEqual(resizeZone(z, 'se', 400, 300), { x: 100, y: 100, w: 300, h: 200 });
  assert.deepEqual(resizeZone(z, 'nw', 50, 60), { x: 50, y: 60, w: 250, h: 190 });
  assert.deepEqual(resizeZone(z, 'ne', 350, 120), { x: 100, y: 120, w: 250, h: 130 });
  assert.deepEqual(resizeZone(z, 'sw', 150, 320), { x: 150, y: 100, w: 150, h: 220 });
  assert.deepEqual(resizeZone(z, 'se', 120, 110), { x: 100, y: 100, w: 90, h: 70 }, 'clamped to the 90x70 minimum');
  assert.deepEqual(resizeZone(z, 'se', 120, 110, { w: 320, h: 220 }), { x: 100, y: 100, w: 320, h: 220 }, 'swimlanes keep their larger minimum');
  const flipped = resizeZone(z, 'se', 20, 30);
  assert.equal(flipped.x + flipped.w, 100, 'dragging past the fixed corner flips around it');
});

test('zoneMembers lists the cards whose center sits inside the zone, plus notes inside it', async () => {
  const { zoneMembers } = await import('../src/geometry.js');
  const doc = {
    nodes: [
      { id: 'in', x: 120, y: 120, label: 'a' },
      { id: 'edge', x: 260, y: 120, label: 'b' },
      { id: 'out', x: 900, y: 900, label: 'c' },
    ],
    notes: [{ id: 't-in', x: 130, y: 200, text: 'x' }, { id: 't-out', x: 700, y: 700, text: 'y' }],
    zones: [],
    wires: [],
  };
  const zone = { x: 100, y: 100, w: 200, h: 200 };
  assert.deepEqual(zoneMembers(doc, zone).sort(), ['in', 't-in'], 'a card whose center (312, 157) lies outside is not carried');
});

// Process-flow shapes size like net_draw's: label-driven widths within 96–290,
// fixed heights per shape, and a square connector.
test('nodeSize sizes process-flow shapes like net_draw', () => {
  assert.deepEqual(nodeSize({ kind: 'process', label: 'Process' }), { w: 96, h: 54 });
  assert.deepEqual(nodeSize({ kind: 'decision', label: 'Decision?' }), { w: 137.5, h: 76 });
  assert.deepEqual(nodeSize({ kind: 'dataio', label: 'Data / I-O' }), { w: 140, h: 54 });
  assert.deepEqual(nodeSize({ kind: 'document', label: 'Document' }), { w: 100, h: 62 });
  assert.deepEqual(nodeSize({ kind: 'connector', label: 'A' }), { w: 46, h: 46 });
  assert.equal(nodeSize({ kind: 'process', label: 'x'.repeat(80) }).w, 290, 'capped');
  assert.deepEqual(nodeSize({ kind: 'process', label: 'Process', sublabel: 'ignored', addr: 'too' }), { w: 96, h: 54 }, 'shapes carry no meta lines');
  assert.deepEqual(nodeSize({ kind: 'router', label: 'Core Router', fields: { ip: '10.0.0.1' } }), { w: 104, h: 86.5 }, 'network devices are ordinary cards sized by their fields');
  assert.deepEqual(nodeSize({ kind: 'router', label: 'Core Router', addr: '10.0.0.1' }), { w: 104, h: 74 }, 'the hardware address is not one of their lines');
});

test('nodeMeta shows a schema part\'s filled fields (never severity) and sizes the card by them', () => {
  assert.deepEqual(
    nodeMeta({ kind: 'threatactor', label: 'APT', fields: { type: 'nation-state', severity: 'high', motivation: 'ideology' } }),
    [{ field: 'fields.type', text: 'nation-state' }, { field: 'fields.motivation', text: 'ideology' }],
  );
  assert.deepEqual(nodeMeta({ kind: 'threatactor', label: 'APT', sublabel: 'ignored' }), [], 'the hardware trio does not apply');
  assert.equal(nodeSize({ kind: 'vulnerability', label: 'V', fields: { cve: 'x'.repeat(30) } }).w, 30 * 5.9 + 26);
  assert.deepEqual(nodeMeta({ kind: 'mcu', label: 'M', sublabel: 'STM32', fields: { severity: 'high' } }), [{ field: 'sublabel', text: 'STM32' }]);
});

test('a network device lists its model, IP, and DNS name and drops the hardware address and rail', () => {
  assert.deepEqual(
    nodeMeta({ kind: 'router', label: 'Core', sublabel: 'CRS326', addr: 'ignored', rail: '48V', fields: { ip: '10.0.0.1', dns: 'core.lan' } }),
    [{ field: 'sublabel', text: 'CRS326' }, { field: 'fields.ip', text: '10.0.0.1' }, { field: 'fields.dns', text: 'core.lan' }],
  );
  assert.deepEqual(nodeMeta({ kind: 'firewall', label: 'FW', sublabel: '', fields: { dns: 'fw.lan' } }), [{ field: 'fields.dns', text: 'fw.lan' }]);
  assert.deepEqual(nodeMeta({ kind: 'malware', label: 'M', sublabel: 'stale', fields: { family: 'Mirai' } }), [{ field: 'fields.family', text: 'Mirai' }], 'threats never show a part number');
});
