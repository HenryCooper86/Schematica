import test from 'node:test';
import assert from 'node:assert/strict';
import { wireGeom, wireLabelRect, wireLanes, wireScene, zoneLabelLayout, rectsIntersect } from '../src/geometry.js';
import { diagramMarkup, overlayMarkup } from '../src/render.js';
import { buildExportSVG } from '../src/export.js';
import { EXAMPLES } from '../src/examples.js';

const a = { x: 0, y: 0, w: 104, h: 74 };
const b = { x: 600, y: 0, w: 104, h: 74 };
const blocker = { x: 280, y: -10, w: 104, h: 94 };
const wire = (id, from = 'a', to = 'b', label = 'I2C') => ({
  id, from: { node: from, port: 'i2c' }, to: { node: to, port: 'i2c' }, bus: 'i2c', label,
});
const doc = () => ({ nodes: [
  { id: 'a', kind: 'mcu', label: 'a', x: 0, y: 0 },
  { id: 'b', kind: 'mcu', label: 'b', x: 600, y: 0 },
  { id: 'c', kind: 'mcu', label: 'c', x: 280, y: 0 },
], wires: [wire('w')], zones: [], notes: [] });

// Independently sample the visible SVG curve, including the endpoints.
function points(geo) {
  return Array.from({ length: 201 }, (_, i) => {
    const t = i / 200, u = 1 - t;
    return { x: u ** 3 * geo.p1.x + 3 * u * u * t * geo.c1.x + 3 * u * t * t * geo.c2.x + t ** 3 * geo.p2.x,
      y: u ** 3 * geo.p1.y + 3 * u * u * t * geo.c1.y + 3 * u * t * t * geo.c2.y + t ** 3 * geo.p2.y };
  });
}
function pathGeo(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  return { p1: { x: n[0], y: n[1] }, c1: { x: n[2], y: n[3] }, c2: { x: n[4], y: n[5] }, p2: { x: n[6], y: n[7] } };
}
function group(markup, id) {
  const at = markup.indexOf(`data-id="${id}" data-type="wire"`);
  return markup.slice(markup.lastIndexOf('<g class="wire', at), markup.indexOf('</g>', at));
}
const path = g => g.match(/class="vis[^"]*" d="([^"]+)"/)[1];
const overlaps = (r, s) => r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y;

test('a smooth wire takes a clear detour around an unrelated card', () => {
  const geo = wireGeom(a, b, 0, [blocker]);
  assert.ok(points(geo).every(p => !(p.x > 272 && p.x < 392 && p.y > -18 && p.y < 92)), 'curve keeps clearance around the card');
  assert.ok(points(geo).every(p => !overlaps({ ...p, w: .01, h: .01 }, a) && !overlaps({ ...p, w: .01, h: .01 }, b)), 'detour stays outside its own endpoint cards');
});

test('parallel wire lanes remain stable when the document wire list is reordered', () => {
  const wires = [wire('w1'), wire('w2', 'b', 'a'), wire('w3')];
  assert.deepEqual([...wireLanes(wires)].sort(), [...wireLanes([...wires].reverse())].sort());
});

test('a dense parallel fan retains a distinct attachment for every wire', () => {
  const board = doc(); board.nodes = board.nodes.slice(0, 2);
  board.wires = Array.from({ length: 10 }, (_, i) => wire(`w${i}`));
  const markup = diagramMarkup(board);
  const starts = board.wires.map(w => pathGeo(path(group(markup, w.id))).p1);
  assert.equal(new Set(starts.map(p => `${p.x},${p.y}`)).size, 10);
  assert.ok(starts.every(p => p.x === 109 && p.y >= 18 && p.y <= 56), 'every attachment clears the rounded corners');
});

test('a label slides along its curve into clear space', () => {
  const obstacle = { x: 320, y: 15, w: 70, h: 44 };
  const geo = wireGeom(a, b);
  const label = wireLabelRect(wire('w', 'a', 'b', 'Control interface'), geo, 0, [obstacle]);
  assert.equal(overlaps(label, obstacle), false);
  assert.equal(label.at.y, 37, 'label remains on the straight wire');
});

test('a short connection places its label outside the cards with a leader anchor', () => {
  const close = { ...b, x: 140 };
  const label = wireLabelRect(wire('w', 'a', 'b', 'boot log'), wireGeom(a, close), 0, [a, close]);
  assert.equal(overlaps(label, a) || overlaps(label, close), false);
  assert.equal(label.anchor.y, 37);
  assert.notEqual(label.at.y, label.anchor.y);
});

test('rendered wires and highlight overlays use the clear route without moving cards', () => {
  const board = doc(), before = JSON.stringify(board);
  const d = path(group(diagramMarkup(board), 'w'));
  assert.ok(points(pathGeo(d)).every(p => !(p.x > 280 && p.x < 384 && p.y > 0 && p.y < 74)));
  assert.ok(overlayMarkup(board, { highlight: new Set(['w']) }).includes(`d="${d}"`));
  assert.equal(JSON.stringify(board), before);
});

test('exports keep a routed wire inside their viewBox and match the canvas path', () => {
  const board = doc(), svg = buildExportSVG(board);
  const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const d = path(group(svg, 'w'));
  assert.equal(d, path(group(diagramMarkup(board), 'w')));
  assert.ok(points(pathGeo(d)).every(p => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h));
  assert.ok(y < -24, 'export grows to include the detour above the cards');
});

test('rendered label placement stays stable when crossing wires are reordered', () => {
  const board = { nodes: [
    { id: 'a', kind: 'mcu', label: 'a', x: 0, y: 0 },
    { id: 'b', kind: 'mcu', label: 'b', x: 600, y: 300 },
    { id: 'c', kind: 'mcu', label: 'c', x: 0, y: 300 },
    { id: 'd', kind: 'mcu', label: 'd', x: 600, y: 0 },
  ], wires: [wire('w1'), wire('w2', 'c', 'd')], zones: [], notes: [] };
  const first = diagramMarkup(board);
  const labelBox = g => {
    const n = g.match(/<rect data-detail="context" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/).slice(1).map(Number);
    return { x: n[0], y: n[1], w: n[2], h: n[3] };
  };
  assert.equal(overlaps(labelBox(group(first, 'w1')), labelBox(group(first, 'w2'))), false);
  board.wires.reverse();
  const second = diagramMarkup(board);
  for (const id of ['w1', 'w2']) assert.deepEqual(labelBox(group(first, id)), labelBox(group(second, id)));
});

test('a detour from a stacked card clears the neighbouring card above it', () => {
  const board = EXAMPLES.find(e => e.id === 'ot-purdue').doc;
  const geo = pathGeo(path(group(diagramMarkup(board), 'w15')));
  assert.ok(points(geo).every(p => !(p.x > 1420 && p.x < 1558.1 && p.y > 116 && p.y < 227.5)));
});

test('a crowded connection uses a compact clear turn instead of a wide outside loop', () => {
  const board = structuredClone(EXAMPLES.find(e => e.id === 'drone-fc').doc);
  board.nodes.find(n => n.id === 'n3').y = 232;
  const geo = pathGeo(path(group(diagramMarkup(board), 'w11')));
  assert.ok(points(geo).every(p => p.x >= 280 && p.x <= 950), 'the ground wire stays between its source and destination columns');
});

test('moving, adding and removing unrelated obstacles refreshes the visible route', () => {
  const board = doc();
  const freshMarkup = () => assert.equal(diagramMarkup(board), diagramMarkup(structuredClone(board)), 'an edited board matches a fresh geometry calculation');
  const initial = path(group(diagramMarkup(board), 'w'));
  board.nodes[2].y = 300;
  freshMarkup();
  assert.notEqual(path(group(diagramMarkup(board), 'w')), initial);
  board.nodes[2].y = 0;
  freshMarkup();
  assert.equal(path(group(diagramMarkup(board), 'w')), initial, 'undoing the move restores the original route');
  board.nodes.pop();
  freshMarkup();
  board.notes.push({ id: 'note', x: 280, y: 0, text: 'Keep this note clear' });
  freshMarkup();
  assert.notEqual(path(group(diagramMarkup(board), 'w')), path(group(diagramMarkup({ ...board, notes: [] }), 'w')));
  board.notes[0].y = 300;
  freshMarkup();
  board.notes.length = 0;
  freshMarkup();
  board.nodes.push({ id: 'new', kind: 'mcu', label: 'Added blocker', x: 280, y: 0 });
  freshMarkup();
});

test('card resizing, changed endpoints and changing parallel fans refresh cached routes', () => {
  const board = doc();
  diagramMarkup(board);
  const edits = [
    () => { board.nodes[2].label = 'A much wider unrelated card in the path'; },
    () => { board.nodes[0].label = 'A much wider source card'; },
    () => { board.wires.push(wire('w2')); },
    () => { board.wires[0].to.node = 'c'; },
    () => { board.wires.shift(); },
  ];
  for (const edit of edits) {
    edit();
    assert.equal(diagramMarkup(board), diagramMarkup(structuredClone(board)));
  }
});

test('a wire label keeps clear of a zone caption pill', () => {
  const card = (id, x, y) => ({ id, kind: 'server', x, y, label: id, sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] });
  const doc = { nodes: [card('a', 0, 120), card('b', 400, 120)], wires: [
    { id: 'w', bus: 'eth', from: { node: 'a', port: 'net' }, to: { node: 'b', port: 'net' }, label: 'uplink', arrow: null, style: null, flow: null },
  ], zones: [], notes: [] };
  const free = wireScene(doc).labels.get('w');
  const L = free;
  // A zone whose caption pill sits exactly where the label would go.
  const zone = { id: 'z', x: L.x - 12, y: L.y + L.h / 2 - 0, w: 300, h: 200, label: 'A long zone caption here' };
  const pill = zoneLabelLayout(zone);
  const cap = { x: zone.x + pill.x, y: zone.y + pill.y, w: pill.width, h: pill.height };
  assert.ok(rectsIntersect(cap, free), 'the caption would cover the free label');
  const moved = wireScene({ ...doc, zones: [zone] }).labels.get('w');
  assert.ok(!rectsIntersect(cap, moved), 'the label moves off the caption');
});

test('an automatic bus pill on a too-short wire is left off; a typed label keeps its leader', () => {
  const close = { ...b, x: 140 };
  const geo = wireGeom(a, close);
  const auto = wireLabelRect({ ...wire('w'), label: '' }, geo, 0, [a, close]);
  assert.equal(auto.label, '', 'the bus name is not parked beside the wire');
  assert.equal(wireLabelRect(wire('w', 'a', 'b', 'i2c'), geo, 0, [a, close]).label, '', 'nor a typed copy of the bus name');
  const typed = wireLabelRect(wire('w', 'a', 'b', 'boot log'), geo, 0, [a, close]);
  assert.equal(typed.label, 'boot log');
  assert.ok(typed.anchor, 'a typed label keeps its leader');
  const roomy = wireLabelRect({ ...wire('w'), label: '' }, wireGeom(a, b), 0, [a, b]);
  assert.ok(roomy.label, 'a wire with room keeps its bus pill');
});

test('wire ends stay on the straight part of a card edge, never in a rounded corner', async () => {
  const { nodeRect, wireScene } = await import('../src/geometry.js');
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const onStraightEdge = (p, r) => {
    const inset = (len) => Math.min(18, len / 2);
    // An outcome callout's left-side end sits on its tail tip at mid-height.
    if (r.tail === 'w' && Math.abs(p.x - (r.x - 13 - 5)) < 0.05) return Math.abs(p.y - (r.y + r.h / 2)) < 0.05;
    const side = Math.abs(p.x - (r.x - 5)) < 0.05 || Math.abs(p.x - (r.x + r.w + 5)) < 0.05;
    return side
      ? p.y >= r.y + inset(r.h) - 0.05 && p.y <= r.y + r.h - inset(r.h) + 0.05
      : p.x >= r.x + inset(r.w) - 0.05 && p.x <= r.x + r.w - inset(r.w) + 0.05;
  };
  let checked = 0;
  for (let trial = 0; trial < 12; trial++) for (const ex of EXAMPLES) {
    const d = structuredClone(ex.doc);
    for (const n of d.nodes) if (rnd() < 0.4) { n.x += Math.round((rnd() - 0.5) * 400); n.y += Math.round((rnd() - 0.5) * 300); }
    const rects = new Map(d.nodes.map((n) => [n.id, nodeRect(n)]));
    const { routes } = wireScene(d, rects);
    for (const w of d.wires) {
      const g = routes.get(w.id);
      if (!g || w.from.node === w.to.node) continue;
      checked += 1;
      assert.ok(onStraightEdge(g.p1, rects.get(w.from.node)), `${ex.id}/${w.id} start ${JSON.stringify(g.p1)}`);
      assert.ok(onStraightEdge(g.p2, rects.get(w.to.node)), `${ex.id}/${w.id} end ${JSON.stringify(g.p2)}`);
    }
  }
  assert.ok(checked > 1000);
});
