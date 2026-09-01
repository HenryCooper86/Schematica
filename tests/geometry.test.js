import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, portPosition, portNormal, wirePath, wireMidpoint,
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

test('portNormal points outward', () => {
  assert.deepEqual(portNormal('left'), { x: -1, y: 0 });
  assert.deepEqual(portNormal('right'), { x: 1, y: 0 });
  assert.deepEqual(portNormal('top'), { x: 0, y: -1 });
  assert.deepEqual(portNormal('bottom'), { x: 0, y: 1 });
});

test('wirePath is a cubic from a to b', () => {
  const d = wirePath({ x: 0, y: 0 }, 'right', { x: 100, y: 0 }, 'left');
  assert.match(d, /^M 0 0 C /);
  assert.match(d, / 100 0$/);
});

test('wireMidpoint of a horizontal symmetric wire sits between endpoints', () => {
  const m = wireMidpoint({ x: 0, y: 0 }, 'right', { x: 100, y: 0 }, 'left');
  assert.equal(m.x, 50);
  assert.equal(m.y, 0);
});

test('rect helpers', () => {
  assert.ok(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 }));
  assert.ok(!rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 5 }));
  assert.ok(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }));
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
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

test('contentBounds includes wire curve extents when given a part resolver', () => {
  const fakePart = { ports: [{ id: 'p', name: 'P', side: 'bottom', offset: 0.5, bus: 'gpio' }] };
  const getPartFn = () => fakePart;
  const doc = {
    nodes: [
      { id: 'a', kind: 'x', x: 0, y: 0, w: 100, h: 50 },
      { id: 'b', kind: 'x', x: 200, y: 0, w: 100, h: 50 },
    ],
    wires: [{ id: 'w', bus: 'gpio', from: { node: 'a', port: 'p' }, to: { node: 'b', port: 'p' } }],
    zones: [],
    notes: [],
  };
  const plain = contentBounds(doc);
  const withWires = contentBounds(doc, getPartFn);
  assert.equal(plain.y + plain.h, 50);
  assert.ok(withWires.y + withWires.h > 50, 'bottom-side wire control points must extend the bounds');
});
