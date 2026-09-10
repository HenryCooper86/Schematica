// Align, distribute, and tidy spacing: the arithmetic only. Callers hand in
// measured rectangles ({ id, x, y, w, h, locked }) — a card's size is derived
// from its content (src/geometry.js), never assumed — and get back the new
// top-left positions of the items that actually move. No DOM, no store, no
// side effects, so every rule below is unit-testable on plain objects.

// Positions land on two decimals, the same precision geometry.js keeps for
// wire coordinates: an even gap rarely divides into whole pixels, and rounding
// each item to an integer would make the gaps unequal again by up to a pixel.
const r2 = (v) => Math.round(v * 100) / 100 + 0;

// A mode names the axis it works on, the edge it reads off an item, and where
// that item's top-left has to go for its edge to land on the target.
const MODES = {
  left: { axis: 'x', edge: (i) => i.x, place: (t) => t },
  hcenter: { axis: 'x', edge: (i) => i.x + i.w / 2, place: (t, i) => t - i.w / 2 },
  right: { axis: 'x', edge: (i) => i.x + i.w, place: (t, i) => t - i.w },
  top: { axis: 'y', edge: (i) => i.y, place: (t) => t },
  vmiddle: { axis: 'y', edge: (i) => i.y + i.h / 2, place: (t, i) => t - i.h / 2 },
  bottom: { axis: 'y', edge: (i) => i.y + i.h, place: (t, i) => t - i.h },
};

export const ALIGN_MODES = Object.keys(MODES);

const AXES = { x: { pos: 'x', size: 'w' }, y: { pos: 'y', size: 'h' } };

const movableOf = (items) => items.filter((i) => !i.locked);

// A single locked item in the selection is the anchor: the user pinned exactly
// one thing, so it reads as "line the rest up on that". Two or more locked
// items name no single reference, so the selection's own extent decides.
export function anchorOf(items) {
  const locked = items.filter((i) => i.locked);
  return locked.length === 1 ? locked[0] : null;
}

// Where the aligned edge goes: the anchor's edge, or the extreme of the whole
// selection — locked items included, since a pinned card is a perfectly good
// edge to line up on even when it is not the sole anchor. Centers use the
// midpoint of the selection's bounds rather than the mean of the centers, so
// one wide card does not drag the line toward itself.
function targetEdge(items, mode) {
  const anchor = anchorOf(items);
  if (anchor) return MODES[mode].edge(anchor);
  const { pos, size } = AXES[MODES[mode].axis];
  const lo = Math.min(...items.map((i) => i[pos]));
  const hi = Math.max(...items.map((i) => i[pos] + i[size]));
  if (mode === 'left' || mode === 'top') return lo;
  if (mode === 'right' || mode === 'bottom') return hi;
  return (lo + hi) / 2;
}

// Only the coordinate the mode owns changes; the other is passed through so a
// caller can apply a move without looking the item up again.
function moveTo(item, mode, value) {
  const next = { id: item.id, x: item.x, y: item.y };
  next[AXES[MODES[mode].axis].pos] = r2(value);
  return next;
}

const moved = (item, next) => next.x !== item.x || next.y !== item.y;

// Align every unlocked item onto the target edge. Locked items never move;
// they only ever act as the reference.
export function alignMoves(items, mode) {
  if (!MODES[mode] || !items.length) return [];
  const movable = movableOf(items);
  if (movable.length < 2) return [];
  const target = targetEdge(items, mode);
  const moves = [];
  for (const item of movable) {
    const next = moveTo(item, mode, MODES[mode].place(target, item));
    if (moved(item, next)) moves.push(next);
  }
  return moves;
}

// Leading edge decides the order; ties fall back to the far edge and then the
// id, so the result never depends on the order the selection happens to be in.
function inOrder(items, pos, size) {
  return [...items].sort((a, b) => (
    a[pos] - b[pos] || (a[pos] + a[size]) - (b[pos] + b[size]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  ));
}

// Equal *gaps between edges*, not equal spacing between centers. On cards of
// one size the two agree; on cards of different widths they do not, and the
// gap is the thing the eye reads — center spacing leaves a wide card crowding
// its neighbours while the numbers claim the row is even. So: the outermost
// two items hold still, the rest are laid out with one gap repeated between
// facing edges.
//
// Locked items sit this one out entirely. Even spacing is a property of the
// whole run: it can only come out even if every participant is free to take
// the position the arithmetic gives it, and a locked item is by definition
// not. It stays where it is and the unlocked cards space themselves.
export function distributeMoves(items, axis) {
  const spec = AXES[axis];
  if (!spec) return [];
  const movable = movableOf(items);
  if (movable.length < 3) return [];
  const { pos, size } = spec;
  const sorted = inOrder(movable, pos, size);
  const start = Math.min(...sorted.map((i) => i[pos]));
  const end = Math.max(...sorted.map((i) => i[pos] + i[size]));
  const filled = sorted.reduce((sum, i) => sum + i[size], 0);
  // A negative gap is kept rather than clamped: cards that already overlap end
  // up overlapping by one even amount instead of a random assortment, and the
  // span the user set up is preserved. Widening the run to force a positive
  // gap would move the two items they expect to stay put.
  const gap = (end - start - filled) / (sorted.length - 1);
  // Each item steps its own size plus the gap. Where one item is wide enough to
  // span the whole run, that step can fall to zero or below and two items land
  // on the same point — one of them hidden behind the other from a single
  // button press. No even gap fits in that run, so even gaps are dropped for
  // evenly spaced leading edges: the outermost two still hold still, the span
  // is still the one the user set up, and wherever the leading edges differ at
  // all, every item keeps a place of its own.
  const steps = sorted.slice(0, -1).map((i) => i[size] + gap);
  const places = [];
  if (Math.min(...steps) > 0) {
    let cursor = start;
    for (const item of sorted) {
      places.push(cursor);
      cursor += item[size] + gap;
    }
  } else {
    // `start` is the first item's own leading edge, so the two ends of the run
    // are exactly where they were and only the items between them move.
    const lead = (sorted[sorted.length - 1][pos] - start) / (sorted.length - 1);
    for (let n = 0; n < sorted.length; n += 1) places.push(start + lead * n);
  }
  const moves = [];
  sorted.forEach((item, n) => {
    const next = { id: item.id, x: item.x, y: item.y };
    next[pos] = r2(places[n]);
    if (moved(item, next)) moves.push(next);
  });
  return moves;
}

// Which way the cards run: the wider spread of their centers. A tie reads as a
// row, since that is how a board is normally laid out.
export function dominantAxis(items) {
  if (items.length < 2) return 'x';
  const spread = (pos, size) => {
    const c = items.map((i) => i[pos] + i[size] / 2);
    return Math.max(...c) - Math.min(...c);
  };
  return spread('y', 'h') > spread('x', 'w') ? 'y' : 'x';
}

// Pack the run to one fixed gap along its dominant axis, keeping the reading
// order. The first card holds still and the rest close up (or open out) behind
// it: a run has to grow from one end, and growing from the end it starts at is
// the only choice that does not move a card the user is looking at first.
// The cross-axis coordinate is left alone — tidying spacing is not aligning.
export function tidyMoves(items, { gap = 24 } = {}) {
  const movable = movableOf(items);
  if (movable.length < 2) return [];
  const { pos, size } = AXES[dominantAxis(movable)];
  const sorted = inOrder(movable, pos, size);
  const moves = [];
  let cursor = sorted[0][pos];
  for (const item of sorted) {
    const next = { id: item.id, x: item.x, y: item.y };
    next[pos] = r2(cursor);
    if (moved(item, next)) moves.push(next);
    cursor += item[size] + gap;
  }
  return moves;
}

// What the buttons may offer for this selection. `applies` says whether the
// selection holds anything these buttons act on at all — a selection of only
// wires does not, and a panel of permanently dead buttons is worse than no
// panel. `anchored` is true when a single locked item is deciding the edge, so
// the panel can say so.
export function alignAbility(items) {
  const movable = movableOf(items).length;
  return {
    applies: items.length > 0,
    canAlign: movable >= 2,
    canDistribute: movable >= 3,
    canTidy: movable >= 2,
    anchored: movable >= 2 && !!anchorOf(items),
  };
}
