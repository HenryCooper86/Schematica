import { getPart } from './palette.js';

export function snap(v, grid = 8) {
  // "+ 0" folds the -0 that rounding small negatives produces into +0, so
  // snapped coordinates never serialize as "-0".
  return Math.round(v / grid) * grid + 0;
}

// ---- Cards (net_draw sizing) ----
// A card is 104x74 at minimum and grows with its label and with up to three
// mono meta lines (part number, address, rail), 12.5px per line. Nothing is
// stored: the size always follows the content.
export const NODE_W = 104;
export const NODE_H = 74;
const NODE_MAX_W = 240;
const META_LINE_H = 12.5;

export function nodeMeta(node) {
  const part = getPart(node.kind);
  // Parts with a field schema (threats) show their filled fields instead of
  // the hardware trio; severity has its own tag, so it stays off the lines.
  if (part.fields) {
    return part.fields
      .filter((fd) => fd.id !== 'severity')
      .map((fd) => ({ field: `fields.${fd.id}`, text: String(node.fields?.[fd.id] ?? '').trim() }))
      .filter((m) => m.text)
      .slice(0, 3);
  }
  return [['sublabel', node.sublabel], ['addr', node.addr], ['rail', node.rail]]
    .map(([field, v]) => ({ field, text: String(v ?? '').trim() }))
    .filter((m) => m.text)
    .slice(0, 3);
}

// Process-flow shapes size like net_draw's: the label sets the width within
// 96–290 (decisions and slanted shapes get extra room), heights are fixed per
// shape, and a connector is a circle just big enough for its letter.
function shapeSize(shape, label) {
  const L = label.length;
  if (shape === 'connector') {
    const r = Math.min(60, Math.max(23, L * 3.6 + 16));
    return { w: r * 2, h: r * 2 };
  }
  let w = L * 7 + 44;
  if (shape === 'decision') w = L * 7.5 + 70;
  if (shape === 'data' || shape === 'manual') w += 26;
  w = Math.min(290, Math.max(96, w));
  const h = shape === 'decision' ? 76 : (shape === 'document' ? 62 : 54);
  return { w, h };
}

export function nodeSize(node) {
  const part = getPart(node.kind);
  if (part.shape) return shapeSize(part.shape, String(node.label ?? ''));
  const meta = nodeMeta(node);
  const need = Math.max(
    NODE_W,
    String(node.label ?? '').length * 6.8 + 24,
    ...meta.map((m) => m.text.length * 5.9 + 26),
  );
  return { w: Math.min(NODE_MAX_W, need), h: NODE_H + meta.length * META_LINE_H };
}

export function nodeRect(node) {
  const { w, h } = nodeSize(node);
  return { x: node.x, y: node.y, w, h };
}

export function portPosition(node, portDef) {
  const { side, offset } = portDef;
  if (side === 'left') return { x: node.x, y: node.y + node.h * offset };
  if (side === 'right') return { x: node.x + node.w, y: node.y + node.h * offset };
  if (side === 'top') return { x: node.x + node.w * offset, y: node.y };
  return { x: node.x + node.w * offset, y: node.y + node.h };
}

// ---- Wires (net_draw edge geometry) ----
// A wire leaves each card through the point where the ray toward the other
// card's center crosses the card's edge (padded 5px), and the cubic bends
// along the dominant axis only, so every wire enters and exits straight.

const r2 = (v) => Math.round(v * 100) / 100 + 0;

const ANCHOR_PAD = 5;

function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

// Where the ray from origin toward `toward` exits `rect` grown by `pad`.
function anchor(rect, origin, toward, pad) {
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  if (dx === 0 && dy === 0) return { x: origin.x, y: origin.y };
  const tx = dx > 0 ? (rect.x + rect.w + pad - origin.x) / dx
    : dx < 0 ? (rect.x - pad - origin.x) / dx : Infinity;
  const ty = dy > 0 ? (rect.y + rect.h + pad - origin.y) / dy
    : dy < 0 ? (rect.y - pad - origin.y) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  return { x: origin.x + dx * t, y: origin.y + dy * t };
}

function cubic(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let c1;
  let c2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    c1 = { x: r2(p1.x + dx * 0.4), y: p1.y };
    c2 = { x: r2(p2.x - dx * 0.4), y: p2.y };
  } else {
    c1 = { x: p1.x, y: r2(p1.y + dy * 0.4) };
    c2 = { x: p2.x, y: r2(p2.y - dy * 0.4) };
  }
  return {
    d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    mid: {
      x: r2((p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8),
      y: r2((p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8),
    },
    p1, c1, c2, p2,
  };
}

// `offset` shifts the whole curve sideways (perpendicular to the center line)
// so several wires between the same two cards run side by side.
export function wireGeom(a, b, offset = 0) {
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  let oa = ca;
  let ob = cb;
  if (offset) {
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const px = (-(cb.y - ca.y) / len) * offset;
    const py = ((cb.x - ca.x) / len) * offset;
    oa = { x: ca.x + px, y: ca.y + py };
    ob = { x: cb.x + px, y: cb.y + py };
  }
  const p1 = anchor(a, oa, ob, ANCHOR_PAD);
  const p2 = anchor(b, ob, oa, ANCHOR_PAD);
  return cubic({ x: r2(p1.x), y: r2(p1.y) }, { x: r2(p2.x), y: r2(p2.y) });
}

// A wire being dragged out: leaves the card toward the cursor, ends on it.
export function wireGeomToPoint(node, pt) {
  const p1 = anchor(node, rectCenter(node), pt, ANCHOR_PAD);
  return cubic({ x: r2(p1.x), y: r2(p1.y) }, { x: r2(pt.x), y: r2(pt.y) });
}

export function curvePoint(geo, t) {
  const u = 1 - t;
  const { p1, c1, c2, p2 } = geo;
  return {
    x: r2(u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x),
    y: r2(u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y),
  };
}

// Spacing between wires that share a node pair — wider than a 20px label pill
// so neighbouring pills never touch.
export const WIRE_FAN = 22;

// Sideways offset per wire id. Wires between the same two nodes are fanned
// evenly around the center line; the sign is normalized to the pair's
// canonical direction so a→b and b→a wires never collapse onto one lane.
export function wireLanes(wires) {
  const groups = new Map();
  for (const w of wires) {
    const key = [w.from.node, w.to.node].sort().join(' ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  const lanes = new Map();
  for (const group of groups.values()) {
    group.forEach((w, i) => {
      const sign = w.from.node <= w.to.node ? 1 : -1;
      lanes.set(w.id, sign * (i - (group.length - 1) / 2) * WIRE_FAN + 0);
    });
  }
  return lanes;
}

export function rectContains(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(r1, r2) {
  return r1.x < r2.x + r2.w && r2.x < r1.x + r1.w && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h;
}

export function normRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function wrapText(text, maxChars = 22) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// ---- Swimlanes ----
export const LANE_TITLE_H = 26;
export const LANE_SNAP = 18;

// Inside a swimlane, pull a point's cross-axis coordinate onto the nearest
// lane centerline when it is within LANE_SNAP px. Returns {x, y} (possibly
// adjusted). The title band and everything outside the lane body are left
// untouched.
export function laneSnapPoint(doc, x, y) {
  for (const z of doc.zones) {
    if (z.kind !== 'swimlane' || !z.lanes || !z.lanes.length) continue;
    if (x <= z.x || x >= z.x + z.w || y <= z.y + LANE_TITLE_H || y >= z.y + z.h) continue;
    if (z.orient === 'v') {
      const laneW = z.w / z.lanes.length;
      const i = Math.min(z.lanes.length - 1, Math.floor((x - z.x) / laneW));
      const cx = z.x + (i + 0.5) * laneW;
      if (Math.abs(x - cx) <= LANE_SNAP) return { x: cx, y };
    } else {
      const laneH = (z.h - LANE_TITLE_H) / z.lanes.length;
      const i = Math.min(z.lanes.length - 1, Math.floor((y - z.y - LANE_TITLE_H) / laneH));
      const cy = z.y + LANE_TITLE_H + (i + 0.5) * laneH;
      if (Math.abs(y - cy) <= LANE_SNAP) return { x, y: cy };
    }
  }
  return { x, y };
}

// ---- Zone editing (net_draw's corner handles and zone moves) ----
export const ZONE_MIN = { w: 90, h: 70 };
export const LANE_MIN = { w: 320, h: 220 };

// Drag the `corner` handle (nw/ne/sw/se) of `zone` to (px, py): the opposite
// corner stays fixed, sizes never drop below `min`, and dragging past the
// fixed corner flips the rectangle around it instead of inverting it.
export function resizeZone(zone, corner, px, py, min = ZONE_MIN) {
  const fx = corner.includes('w') ? zone.x + zone.w : zone.x;
  const fy = corner.includes('n') ? zone.y + zone.h : zone.y;
  const w = Math.max(min.w, Math.abs(px - fx));
  const h = Math.max(min.h, Math.abs(py - fy));
  return { x: px >= fx ? fx : fx - w, y: py >= fy ? fy : fy - h, w, h };
}

// The cards whose center lies inside the zone, and the notes anchored inside
// it: moving the zone carries them along.
export function zoneMembers(doc, zone) {
  const inside = (x, y) => x > zone.x && x < zone.x + zone.w && y > zone.y && y < zone.y + zone.h;
  const ids = [];
  for (const n of doc.nodes) {
    const r = nodeRect(n);
    if (inside(r.x + r.w / 2, r.y + r.h / 2)) ids.push(n.id);
  }
  for (const t of doc.notes || []) {
    if (inside(t.x, t.y)) ids.push(t.id);
  }
  return ids;
}

export const NOTE_W = 160;

export function noteHeight(text) {
  return 16 + wrapText(text).length * 16;
}

// Wires never leave the box spanned by their endpoint cards (each end sits on
// a card edge and the control points stay between them), so only nodes,
// zones, and notes decide the extent.
export function contentBounds(doc) {
  const rects = [
    ...doc.nodes.map(nodeRect),
    ...doc.zones.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h })),
    ...doc.notes.map((n) => ({ x: n.x, y: n.y, w: NOTE_W, h: noteHeight(n.text) })),
  ];
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
