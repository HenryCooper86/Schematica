import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, portPosition, wireGeom, wireGeomToPoint, curvePoint, wireLanes, WIRE_FAN,
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
  assert.deepEqual(nodeRect({ x: 1, y: 2, w: 3, h: 4, label: 'x' }), { x: 1, y: 2, w: 3, h: 4 });
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
