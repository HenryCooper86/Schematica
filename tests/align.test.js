// The alignment arithmetic: it takes measured rectangles and returns moves,
// so every rule can be checked on plain objects with no DOM and no store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIGN_MODES, alignMoves, distributeMoves, tidyMoves, dominantAxis, anchorOf, alignAbility,
} from '../src/align.js';

const item = (id, x, y, w = 100, h = 60, extra = {}) => ({ id, x, y, w, h, ...extra });

// Cards of three different widths: an aligned right edge is only right when
// each card's own width is read, so every width test uses this trio.
const trio = () => [item('a', 0, 0, 100, 60), item('b', 40, 100, 200, 40), item('c', 90, 200, 60, 80)];

// The moves applied to a copy, so a test can assert on final rectangles.
function applied(items, moves) {
  const byId = new Map(moves.map((m) => [m.id, m]));
  return items.map((i) => ({ ...i, ...(byId.get(i.id) || {}) }));
}

const at = (rects, id) => rects.find((r) => r.id === id);

test('every mode is offered and moves the whole selection onto one edge', () => {
  assert.deepEqual(ALIGN_MODES, ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']);
  const left = applied(trio(), alignMoves(trio(), 'left'));
  assert.deepEqual(left.map((r) => r.x), [0, 0, 0]);
  const top = applied(trio(), alignMoves(trio(), 'top'));
  assert.deepEqual(top.map((r) => r.y), [0, 0, 0]);
});

test('right and bottom read each card\'s own size, not a constant', () => {
  const right = applied(trio(), alignMoves(trio(), 'right'));
  // The rightmost edge is b (40 + 200); every card's right edge lands there.
  assert.deepEqual(right.map((r) => r.x + r.w), [240, 240, 240]);
  assert.deepEqual(right.map((r) => r.x), [140, 40, 180]);
  const bottom = applied(trio(), alignMoves(trio(), 'bottom'));
  assert.deepEqual(bottom.map((r) => r.y + r.h), [280, 280, 280]);
});

test('centers align on the midpoint of the selection bounds, not the mean center', () => {
  // Bounds run 0..240, so the line is 120. A mean of the three centers would
  // be 118.33 and would drift toward whichever card is widest.
  const mid = applied(trio(), alignMoves(trio(), 'hcenter'));
  for (const r of mid) assert.equal(r.x + r.w / 2, 120);
  const vmid = applied(trio(), alignMoves(trio(), 'vmiddle'));
  for (const r of vmid) assert.equal(r.y + r.h / 2, 140);
});

test('an item already on the edge is not reported as a move', () => {
  const moves = alignMoves(trio(), 'left');
  assert.deepEqual(moves.map((m) => m.id), ['b', 'c'], 'a is already leftmost');
});

test('align needs two movable items and distribute needs three', () => {
  assert.deepEqual(alignMoves([item('a', 0, 0)], 'left'), []);
  assert.deepEqual(alignMoves([], 'left'), []);
  assert.deepEqual(distributeMoves(trio().slice(0, 2), 'x'), []);
  assert.deepEqual(alignMoves(trio(), 'nowhere'), []);
  assert.deepEqual(distributeMoves(trio(), 'diagonal'), []);
});

test('a single locked item is the anchor the rest line up on', () => {
  const items = [item('a', 0, 0, 100, 60), item('b', 40, 100, 200, 40, { locked: true }), item('c', 90, 200, 60, 80)];
  assert.equal(anchorOf(items).id, 'b');
  const left = applied(items, alignMoves(items, 'left'));
  assert.deepEqual(left.map((r) => r.x), [40, 40, 40], 'the locked left edge wins over the leftmost one');
  const right = applied(items, alignMoves(items, 'right'));
  assert.deepEqual(right.map((r) => r.x + r.w), [240, 240, 240]);
});

test('two locked items name no anchor, so the selection extent decides again', () => {
  const items = [
    item('a', 0, 0, 100, 60, { locked: true }), item('b', 40, 100, 200, 40, { locked: true }), item('c', 90, 200, 60, 80),
  ];
  assert.equal(anchorOf(items), null);
  // Only c can move, and one movable item is below the threshold.
  assert.deepEqual(alignMoves(items, 'left'), []);
  const four = [...items, item('d', 300, 300, 50, 50)];
  const left = applied(four, alignMoves(four, 'left'));
  assert.deepEqual(left.map((r) => r.x), [0, 40, 0, 0], 'locked cards keep their own x');
});

test('locked items never move, whatever the mode', () => {
  const items = [item('a', 0, 0, 100, 60), item('b', 40, 100, 200, 40, { locked: true }), item('c', 90, 200, 60, 80)];
  for (const mode of ALIGN_MODES) {
    assert.ok(!alignMoves(items, mode).some((m) => m.id === 'b'), mode);
  }
});

test('a selection where everything is locked is a no-op', () => {
  const items = trio().map((i) => ({ ...i, locked: true }));
  for (const mode of ALIGN_MODES) assert.deepEqual(alignMoves(items, mode), []);
  assert.deepEqual(distributeMoves(items, 'x'), []);
  assert.deepEqual(tidyMoves(items, { gap: 20 }), []);
  const ability = alignAbility(items);
  assert.deepEqual([ability.canAlign, ability.canDistribute, ability.canTidy], [false, false, false]);
});

test('distribute leaves equal gaps between edges, not equal spacing between centers', () => {
  const items = [item('a', 0, 0, 100, 20), item('b', 150, 0, 300, 20), item('c', 500, 0, 100, 20)];
  const out = applied(items, distributeMoves(items, 'x'));
  // Span 0..600 holds 500px of card, so the two gaps are 50 each.
  const gap1 = at(out, 'b').x - (at(out, 'a').x + at(out, 'a').w);
  const gap2 = at(out, 'c').x - (at(out, 'b').x + at(out, 'b').w);
  assert.equal(gap1, 50);
  assert.equal(gap2, 50);
  // Equal center spacing would have put b's center at 300; it sits at 300 only
  // by coincidence of this span, so check the edge rule directly instead.
  assert.equal(at(out, 'b').x, 150);
});

test('distribute holds the outermost two items still and works on either axis', () => {
  const items = [item('a', 0, 0, 40, 40), item('b', 0, 10, 40, 100), item('c', 0, 400, 40, 60)];
  const out = applied(items, distributeMoves(items, 'y'));
  assert.equal(at(out, 'a').y, 0);
  assert.equal(at(out, 'c').y + at(out, 'c').h, 460);
  const g1 = at(out, 'b').y - (at(out, 'a').y + at(out, 'a').h);
  const g2 = at(out, 'c').y - (at(out, 'b').y + at(out, 'b').h);
  assert.equal(Math.round(g1 * 100), Math.round(g2 * 100));
  assert.deepEqual(distributeMoves(items, 'y').filter((m) => m.id !== 'b'), [], 'only the middle card moved');
});

test('cards that already overlap are given one even overlap, not a refusal', () => {
  const items = [item('a', 0, 0, 100, 20), item('b', 10, 0, 100, 20), item('c', 40, 0, 100, 20)];
  const out = applied(items, distributeMoves(items, 'x'));
  const g1 = at(out, 'b').x - (at(out, 'a').x + at(out, 'a').w);
  const g2 = at(out, 'c').x - (at(out, 'b').x + at(out, 'b').w);
  assert.equal(g1, -80);
  assert.equal(g2, -80);
  assert.equal(at(out, 'a').x, 0, 'the span the user set up is kept');
  assert.equal(at(out, 'c').x + at(out, 'c').w, 140);
});

test('distribute ignores the order the selection came in and sorts by position', () => {
  const items = [item('c', 500, 0, 100, 20), item('a', 0, 0, 100, 20), item('b', 150, 0, 300, 20)];
  const out = applied(items, distributeMoves(items, 'x'));
  assert.equal(at(out, 'a').x, 0);
  assert.equal(at(out, 'b').x, 150);
  assert.equal(at(out, 'c').x, 500);
});

test('a locked card sits out a distribution instead of skewing it', () => {
  const items = [
    item('a', 0, 0, 100, 20), item('b', 150, 0, 100, 20),
    item('c', 300, 0, 100, 20), item('locked', 600, 0, 100, 20, { locked: true }),
  ];
  const out = applied(items, distributeMoves(items, 'x'));
  assert.equal(at(out, 'locked').x, 600);
  // The span is the movable run (0..400), so nothing here needs to move.
  assert.deepEqual(distributeMoves(items, 'x'), []);
});

test('dominant axis follows the wider spread of centers, and a tie reads as a row', () => {
  assert.equal(dominantAxis([item('a', 0, 0), item('b', 400, 10)]), 'x');
  assert.equal(dominantAxis([item('a', 0, 0), item('b', 10, 400)]), 'y');
  assert.equal(dominantAxis([item('a', 0, 0), item('b', 300, 300)]), 'x');
  assert.equal(dominantAxis([item('a', 0, 0)]), 'x');
});

test('tidy spacing packs the run to one gap and keeps the cross axis alone', () => {
  const items = [item('a', 0, 5, 100, 20), item('b', 300, 40, 60, 20), item('c', 700, 80, 140, 20)];
  const out = applied(items, tidyMoves(items, { gap: 20 }));
  assert.deepEqual(out.map((r) => r.x), [0, 120, 200]);
  assert.deepEqual(out.map((r) => r.y), [5, 40, 80], 'tidying spacing is not aligning');
});

test('tidy spacing follows the dominant axis of the run', () => {
  const column = [item('a', 5, 0, 100, 40), item('b', 40, 300, 100, 60), item('c', 90, 700, 100, 20)];
  assert.deepEqual(applied(column, tidyMoves(column, { gap: 10 })).map((r) => r.y), [0, 50, 120]);
  assert.deepEqual(applied(column, tidyMoves(column, { gap: 10 })).map((r) => r.x), [5, 40, 90], 'the cross axis is left alone');
});

test('tidy spacing takes two items and leaves a locked one where it is', () => {
  const items = [item('a', 0, 0, 100, 20), item('b', 500, 0, 100, 20, { locked: true }), item('c', 900, 0, 100, 20)];
  const out = applied(items, tidyMoves(items, { gap: 30 }));
  assert.equal(at(out, 'b').x, 500);
  assert.equal(at(out, 'c').x, 130, 'the two movable cards close up on the first one');
  assert.deepEqual(tidyMoves([item('a', 0, 0)], { gap: 30 }), []);
});

test('positions land on two decimals so an even gap stays even', () => {
  // Four 10px cards across a 41px span: the gap is a third of a pixel.
  const items = [item('a', 0, 0, 10, 10), item('b', 5, 0, 10, 10), item('c', 20, 0, 10, 10), item('d', 31, 0, 10, 10)];
  const moves = distributeMoves(items, 'x');
  for (const m of moves) assert.equal(m.x, Math.round(m.x * 100) / 100);
  const out = applied(items, moves);
  assert.deepEqual(out.map((r) => r.x), [0, 10.33, 20.67, 31]);
});

test('alignAbility reports what the selection can do and the anchor the panel shows', () => {
  const two = alignAbility([item('a', 0, 0), item('b', 300, 0)]);
  assert.deepEqual([two.applies, two.canAlign, two.canDistribute, two.canTidy, two.anchored], [true, true, false, true, false]);
  const three = alignAbility([item('a', 0, 0), item('b', 0, 300), item('c', 0, 600)]);
  assert.equal(three.canDistribute, true);
  const anchored = alignAbility([item('a', 0, 0), item('b', 300, 0), item('p', 600, 0, 100, 60, { locked: true })]);
  assert.equal(anchored.anchored, true);
  const one = alignAbility([item('a', 0, 0), item('p', 600, 0, 100, 60, { locked: true })]);
  assert.deepEqual([one.canAlign, one.anchored], [false, false], 'one movable card has nothing to align with');
});

test('a selection holding nothing these buttons act on says so', () => {
  // tools.js measures cards, notes, and zones and skips wires, so a selection
  // of only wires reaches the arithmetic as an empty list.
  const none = alignAbility([]);
  assert.deepEqual([none.applies, none.canAlign, none.canTidy], [false, false, false]);
  // One locked card is still something alignment is about; it just cannot act
  // on it yet, which is what the disabled buttons say.
  const locked = alignAbility([item('a', 0, 0, 100, 60, { locked: true })]);
  assert.deepEqual([locked.applies, locked.canAlign], [true, false]);
});

test('distribute never lands two items on the same point', () => {
  // `a` is wider than the whole run, so the even gap (-10) exactly cancels the
  // 10px cards that follow it: the old arithmetic put b and c both at 190, one
  // completely hidden behind the other. Leading edges are spaced evenly
  // instead, which here is what the user already had.
  const items = [item('a', 0, 0, 200, 20), item('b', 50, 0, 10, 20), item('c', 100, 0, 10, 20)];
  const out = applied(items, distributeMoves(items, 'x'));
  assert.deepEqual(out.map((r) => r.x), [0, 50, 100]);
  assert.equal(new Set(out.map((r) => r.x)).size, 3);
});

test('the even-edge-gap rule still runs wherever an even gap fits', () => {
  // Mild overlap: 100px cards in a 140px span. Every step (100 - 80) is still
  // positive, so the fallback stays out of the way.
  const mild = [item('a', 0, 0, 100, 20), item('b', 10, 0, 100, 20), item('c', 40, 0, 100, 20)];
  assert.deepEqual(applied(mild, distributeMoves(mild, 'x')).map((r) => r.x), [0, 20, 40]);
  // A wide *last* card cannot collapse the run: nothing steps by its size.
  const wideLast = [item('a', 0, 0, 200, 20), item('b', 50, 0, 100, 20), item('c', 100, 0, 10, 20)];
  const out = applied(wideLast, distributeMoves(wideLast, 'x'));
  const g1 = at(out, 'b').x - (at(out, 'a').x + at(out, 'a').w);
  const g2 = at(out, 'c').x - (at(out, 'b').x + at(out, 'b').w);
  assert.equal(g1, g2, 'one even (negative) gap, and every card still distinct');
  assert.equal(new Set(out.map((r) => r.x)).size, 3);
});

test('the fallback keeps the outermost two items exactly where they were', () => {
  const items = [item('a', 0, 0, 500, 20), item('b', 30, 0, 10, 20), item('c', 60, 0, 10, 20), item('d', 300, 0, 10, 20)];
  const out = applied(items, distributeMoves(items, 'x'));
  assert.equal(at(out, 'a').x, 0);
  assert.equal(at(out, 'd').x, 300);
  assert.deepEqual(out.map((r) => r.x), [0, 100, 200, 300], 'evenly spaced leading edges');
});
