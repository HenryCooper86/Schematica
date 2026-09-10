// Deterministic placement for what the assistant creates. Full layout works
// outward from a hub: power parts go to columns on the left, everything else
// to the right, rows ordered by their neighbours. Incremental placement
// (Task 9) puts one new item beside an anchor and never moves anything that
// already has a position. Same input, same output; ties break on id.
import { CATEGORIES } from '../palette.js';
import { partOf } from '../custom.js';
import { nodeSize, nodeRect, snap, contentBounds, zoneMembers, NOTE_W, noteHeight, rectsIntersect } from '../geometry.js';

export const COL_GAP = 96;
export const ROW_GAP = 40;
export const ZONE_PAD = 28;
const NOTE_GAP = 16;
const SLOT_MARGIN = 24;
export const ORIGIN = 40;

const CAT_INDEX = new Map(CATEGORIES.map((c, i) => [c.id, i]));
const category = (node) => partOf(node).category;
const isPower = (node) => category(node) === 'power';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Undirected adjacency over the given nodes: id -> Map(neighbour -> wire count).
export function adjacency(doc, ids) {
  const set = new Set(ids);
  const adj = new Map(ids.map((id) => [id, new Map()]));
  for (const w of doc.wires) {
    const a = w.from.node;
    const b = w.to.node;
    if (a === b || !set.has(a) || !set.has(b)) continue;
    adj.get(a).set(b, (adj.get(a).get(b) || 0) + 1);
    adj.get(b).set(a, (adj.get(b).get(a) || 0) + 1);
  }
  return adj;
}

const degree = (adj, id) => [...adj.get(id).values()].reduce((s, n) => s + n, 0);

// The best-connected compute part, else the best-connected node; ties by id.
export function pickHub(doc, ids, adj) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const best = (list) => [...list].sort((a, b) => degree(adj, b) - degree(adj, a) || cmp(a, b))[0];
  const compute = ids.filter((id) => category(byId.get(id)) === 'compute');
  return best(compute.length ? compute : ids);
}

// A locked card is an anchor, not a participant: it keeps its coordinates and
// the laid-out block is placed clear of it, to the right of everything locked.
// The graph still counts locked cards, so columns and rows come out the same
// shape they would have without the locks.
export function layoutAll(doc, zoneOf = new Map()) {
  const ids = doc.nodes.map((n) => n.id);
  if (!ids.length) return;
  const pinned = new Map(doc.nodes.filter((n) => n.locked).map((n) => [n.id, { x: n.x, y: n.y }]));
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const adj = adjacency(doc, ids);
  const hub = pickHub(doc, ids, adj);

  // Breadth-first distance from the hub; unreachable parts go one past the edge.
  const dist = new Map([[hub, 0]]);
  const queue = [hub];
  while (queue.length) {
    const id = queue.shift();
    for (const nb of [...adj.get(id).keys()].sort(cmp)) {
      if (!dist.has(nb)) { dist.set(nb, dist.get(id) + 1); queue.push(nb); }
    }
  }
  const far = Math.max(0, ...dist.values()) + 1;
  const col = new Map();
  for (const id of ids) {
    const d = dist.has(id) ? dist.get(id) : far;
    col.set(id, isPower(byId.get(id)) ? -d : d);
  }
  const columns = new Map();
  for (const id of ids) {
    const c = col.get(id); // a power hub yields -0; Map keys fold it into 0 (SameValueZero)
    if (!columns.has(c)) columns.set(c, []);
    columns.get(c).push(id);
  }

  // Rows: sweep outward from the hub column; a node's key is the mean row
  // of its neighbours in the column one step nearer the hub, and members of
  // one zone stay contiguous by sharing the group's mean.
  const order = [...columns.keys()].sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
  const row = new Map();
  for (const c of order) {
    const ref = c > 0 ? c - 1 : c + 1;
    const members = columns.get(c);
    const key = new Map();
    for (const id of members) {
      const rows = [...adj.get(id).keys()].filter((nb) => col.get(nb) === ref && row.has(nb)).map((nb) => row.get(nb));
      key.set(id, rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : Infinity);
    }
    const group = (id) => zoneOf.get(id) || `~${id}`;
    const groupKeys = new Map();
    for (const id of members) {
      const g = group(id);
      if (!groupKeys.has(g)) groupKeys.set(g, []);
      if (Number.isFinite(key.get(id))) groupKeys.get(g).push(key.get(id));
    }
    const groupKey = (g) => {
      const ks = groupKeys.get(g);
      return ks.length ? ks.reduce((s, k) => s + k, 0) / ks.length : Infinity;
    };
    members.sort((a, b) => cmp(groupKey(group(a)), groupKey(group(b)))
      || cmp(group(a), group(b))
      || cmp(key.get(a), key.get(b))
      || cmp(CAT_INDEX.get(category(byId.get(a))), CAT_INDEX.get(category(byId.get(b))))
      || cmp(byId.get(a).label, byId.get(b).label)
      || cmp(a, b));
    members.forEach((id, i) => row.set(id, i));
  }

  // Coordinates: each column as wide as its widest card, centred on a shared
  // midline, then shifted into positive space and snapped to the grid.
  const widths = new Map();
  const heights = new Map();
  for (const [c, members] of columns) {
    widths.set(c, Math.max(...members.map((id) => nodeSize(byId.get(id)).w)));
    heights.set(c, members.reduce((s, id) => s + nodeSize(byId.get(id)).h, 0) + ROW_GAP * (members.length - 1));
  }
  const cs = [...columns.keys()].sort((a, b) => a - b);
  const xs = new Map([[0, 0]]);
  let prev = 0;
  for (const c of cs.filter((k) => k > 0)) { xs.set(c, xs.get(prev) + widths.get(prev) + COL_GAP); prev = c; }
  prev = 0;
  for (const c of cs.filter((k) => k < 0).sort((a, b) => b - a)) { xs.set(c, xs.get(prev) - COL_GAP - widths.get(c)); prev = c; }
  for (const [c, members] of columns) {
    let y = -heights.get(c) / 2;
    for (const id of members) {
      const n = byId.get(id);
      const s = nodeSize(n);
      n.x = xs.get(c) + (widths.get(c) - s.w) / 2;
      n.y = y;
      y += s.h + ROW_GAP;
    }
  }
  // Every locked card goes back to the coordinates it came in with; the block
  // of the rest then starts at the origin, or in the first free column to the
  // right of the locked cards, so nothing is laid out on top of one.
  for (const n of doc.nodes) if (pinned.has(n.id)) Object.assign(n, pinned.get(n.id));
  const moved = doc.nodes.filter((n) => !pinned.has(n.id));
  if (!moved.length) return;
  const anchors = doc.nodes.filter((n) => pinned.has(n.id)).map(nodeRect);
  const originX = anchors.length ? up(Math.max(...anchors.map((r) => r.x + r.w)) + COL_GAP) : ORIGIN;
  const originY = anchors.length ? up(Math.min(...anchors.map((r) => r.y))) : ORIGIN;
  const minX = Math.min(...moved.map((n) => n.x));
  const minY = Math.min(...moved.map((n) => n.y));
  for (const n of moved) {
    n.x = snap(n.x - minX + originX);
    n.y = snap(n.y - minY + originY);
  }
}

const down = (v) => Math.floor(v / 8) * 8;
const up = (v) => Math.ceil(v / 8) * 8;
const noteRect = (t) => ({ x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) });
const zoneRect = (z) => ({ x: z.x, y: z.y, w: z.w, h: z.h });

// The zone rectangle around its members: padding all round plus room for
// the title pill on the top edge.
export function fitZone(doc, zone, memberIds) {
  if (zone.locked) return false; // resizing a zone is a move of its edges
  const rects = memberIds.map((id) => doc.nodes.find((n) => n.id === id)).filter(Boolean).map(nodeRect);
  if (!rects.length) return false;
  const x1 = down(Math.min(...rects.map((r) => r.x)) - ZONE_PAD);
  const y1 = down(Math.min(...rects.map((r) => r.y)) - ZONE_PAD - 8);
  const x2 = up(Math.max(...rects.map((r) => r.x + r.w)) + ZONE_PAD);
  const y2 = up(Math.max(...rects.map((r) => r.y + r.h)) + ZONE_PAD);
  Object.assign(zone, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  return true;
}

// Zones that overlap after placement: the later one in id order moves
// down with its members, then is fitted again. A push whose moved cards
// would land on a card that did not move is undone: cards never overlap,
// zone rectangles occasionally do.
export function pushApart(doc, zones) {
  const byId = new Map(doc.zones.map((z) => [z.id, z]));
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const ordered = [...zones].sort((a, b) => cmp(a.id, b.id));
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const zi = byId.get(ordered[i].id);
      const zj = byId.get(ordered[j].id);
      if (!zi || !zj || !rectsIntersect(zi, zj)) continue;
      const dy = up(zi.y + zi.h + NOTE_GAP - zj.y);
      const moved = ordered[j].members.map((id) => nodeById.get(id)).filter(Boolean);
      // A locked zone, or one holding a locked card, is not pushed anywhere.
      if (zj.locked || moved.some((n) => n.locked)) continue;
      const movedIds = new Set(moved.map((n) => n.id));
      const before = { x: zj.x, y: zj.y, w: zj.w, h: zj.h };
      for (const n of moved) n.y += dy;
      fitZone(doc, zj, ordered[j].members);
      const still = doc.nodes.filter((n) => !movedIds.has(n.id)).map(nodeRect);
      const collides = moved.some((n) => still.some((r) => rectsIntersect(nodeRect(n), r)));
      if (collides) {
        for (const n of moved) n.y -= dy;
        Object.assign(zj, before);
      }
    }
  }
}

// A note goes just above the node it is near, else above the whole board;
// either way it steps past anything it would cover.
export function placeNote(doc, noteId, hint = {}, skip = new Set()) {
  const note = doc.notes.find((t) => t.id === noteId);
  if (!note || note.locked) return;
  const h = noteHeight(note.text);
  const anchor = hint.near ? doc.nodes.find((n) => n.id === hint.near) : null;
  const others = doc.notes.filter((t) => t.id !== noteId && !skip.has(t.id));
  const obstacles = [...doc.nodes.map(nodeRect), ...others.map(noteRect)];
  let x;
  let y;
  if (anchor) {
    const ar = nodeRect(anchor);
    x = ar.x + (ar.w - NOTE_W) / 2;
    y = ar.y - NOTE_GAP - h;
  } else {
    const b = contentBounds({ nodes: doc.nodes, zones: doc.zones, notes: others });
    x = b ? b.x : ORIGIN;
    y = b ? b.y - NOTE_GAP - h : ORIGIN;
  }
  x = snap(x);
  y = snap(y);
  for (let tries = 0; tries < 12; tries++) {
    const hit = obstacles.find((o) => rectsIntersect({ x, y, w: NOTE_W, h }, o));
    if (!hit) break;
    if (anchor) y = snap(hit.y - NOTE_GAP - h);
    else x = snap(hit.x + hit.w + NOTE_GAP);
  }
  note.x = x;
  note.y = y;
}

// "Tidy up": every unlocked card is laid out again, zones are refitted around
// the members they had, and notes are stacked above the board. Refuses (and
// changes nothing) when the board has a swimlane, since relaying members
// would strand them outside their lane. Locked cards, zones, and notes keep
// the positions their owner pinned them to.
export function arrangeAll(doc) {
  if (doc.zones.some((z) => z.kind === 'swimlane')) return false;
  const zones = doc.zones
    .filter((z) => z.kind !== 'swimlane')
    .map((z) => ({ id: z.id, members: zoneMembers(doc, z).filter((id) => doc.nodes.some((n) => n.id === id)) }));
  const zoneOf = new Map();
  for (const z of zones) for (const m of z.members) zoneOf.set(m, z.id);
  layoutAll(doc, zoneOf);
  for (const z of zones) {
    const zone = doc.zones.find((x) => x.id === z.id);
    if (z.members.length) fitZone(doc, zone, z.members);
  }
  pushApart(doc, zones);
  const skip = new Set(doc.notes.map((t) => t.id));
  for (const t of doc.notes) {
    placeNote(doc, t.id, {}, skip);
    skip.delete(t.id);
  }
  return true;
}

// One new card: beside its anchor (the `near` hint, else the placed
// neighbour it shares the most wires with), on the power side for power
// parts, in the first free slot scanning down then up. With `zone`, the
// search stays inside that zone and the zone grows when it is full.
function placeOne(doc, nodeId, hint = {}, skip = new Set(), newZoneIds = new Set()) {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node || node.locked) return;
  const size = nodeSize(node);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const placed = doc.nodes.filter((n) => n.id !== nodeId && !skip.has(n.id));
  let anchor = hint.near ? byId.get(hint.near) : null;
  if (anchor && skip.has(anchor.id)) anchor = null;
  if (!anchor) {
    const counts = new Map();
    for (const w of doc.wires) {
      const other = w.from.node === nodeId ? w.to.node : (w.to.node === nodeId ? w.from.node : null);
      if (other && other !== nodeId && byId.has(other) && !skip.has(other)) counts.set(other, (counts.get(other) || 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0];
    anchor = best ? byId.get(best[0]) : null;
  }
  const zone = hint.zone && !newZoneIds.has(hint.zone) ? doc.zones.find((z) => z.id === hint.zone) : null;
  const obstacles = [
    ...placed.map(nodeRect),
    ...doc.notes.filter((t) => !skip.has(t.id)).map(noteRect),
    ...doc.zones.filter((z) => z.id !== zone?.id && !skip.has(z.id)).map(zoneRect),
  ];
  let x;
  let startY;
  if (zone) {
    x = zone.x + ZONE_PAD;
    startY = zone.y + ZONE_PAD + 8;
  } else if (anchor) {
    const ar = nodeRect(anchor);
    x = isPower(node) ? ar.x - COL_GAP - size.w : ar.x + ar.w + COL_GAP;
    startY = ar.y;
  } else {
    const b = contentBounds({
      nodes: placed,
      zones: doc.zones.filter((z) => !skip.has(z.id)),
      notes: doc.notes.filter((t) => !skip.has(t.id)),
    });
    x = b ? b.x + b.w + COL_GAP : ORIGIN;
    startY = b ? b.y : ORIGIN;
  }
  x = snap(x);
  startY = snap(startY);
  const step = Math.max(8, snap(size.h + ROW_GAP));
  const free = (y) => {
    if (zone && y + size.h + ZONE_PAD > zone.y + zone.h) return false;
    const r = { x: x - SLOT_MARGIN, y: y - SLOT_MARGIN, w: size.w + 2 * SLOT_MARGIN, h: size.h + 2 * SLOT_MARGIN };
    return !obstacles.some((o) => rectsIntersect(r, o));
  };
  const candidates = [];
  for (let k = 0; k <= 60; k++) candidates.push(startY + k * step);
  if (!zone) for (let k = 1; k <= 60; k++) candidates.push(startY - k * step);
  let y = candidates.find(free);
  if (y === undefined && zone && !zone.locked) {
    zone.h += step;
    y = candidates.find(free);
  }
  if (y === undefined) y = startY;
  node.x = x;
  node.y = y;
}

// Places everything a batch created. With no placed cards on the board the
// whole board is laid out; otherwise each new card is placed incrementally
// and nothing that already had a position moves. Then zones are fitted and
// notes placed.
export function placeNew(doc, layout) {
  const { nodes = [], zones = [], notes = [], hints = new Map(), refit = [] } = layout;
  const skip = new Set([...nodes, ...notes, ...zones.map((z) => z.id)]);
  const newZoneIds = new Set(zones.map((z) => z.id));
  const placedBefore = doc.nodes.some((n) => !skip.has(n.id));
  if (!placedBefore) {
    const zoneOf = new Map();
    for (const z of zones) for (const m of z.members) zoneOf.set(m, z.id);
    layoutAll(doc, zoneOf);
  } else {
    for (const id of nodes) {
      placeOne(doc, id, hints.get(id) || {}, skip, newZoneIds);
      skip.delete(id);
    }
  }
  const fitted = [];
  for (const z of [...zones, ...refit]) {
    const zone = doc.zones.find((x) => x.id === z.id);
    if (zone && fitZone(doc, zone, z.members)) fitted.push(z);
    skip.delete(z.id);
  }
  if (!placedBefore) pushApart(doc, fitted);
  for (const id of notes) {
    placeNote(doc, id, hints.get(id) || {}, skip);
    skip.delete(id);
  }
}
