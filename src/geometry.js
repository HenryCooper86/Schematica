import { BUSES } from './buses.js';
import { partOf } from './custom.js';

export function snap(v, grid = 8) {
  // "+ 0" folds the -0 that rounding small negatives produces into +0, so
  // snapped coordinates never serialize as "-0".
  return Math.round(v / grid) * grid + 0;
}

// ---- Cards (net_draw sizing) ----
// A card is 104x74 at minimum and grows with its label and with up to three
// mono meta lines (part number, address, rail), 12.5px per line. Nothing is
// stored: the size always follows the content.
const NODE_W = 104;
const NODE_H = 74;
const NODE_MAX_W = 240;
const META_LINE_H = 12.5;

// Custom cards grow so their port dots stay apart: 15px per port down the
// left or right edge, 22px along the top or bottom. Built-in cards never
// grow this way, so existing boards keep their geometry.
const PORT_GAP_Y = 15;
const PORT_GAP_X = 22;

// Width units of a string for card sizing. The card formulas were tuned for
// Latin text at 5.9–7px per character; a CJK glyph is about 1.9 times that.
// Pure ASCII returns `.length`, so every English board keeps its geometry.
const WIDE = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/u;
export function textUnits(s) {
  let n = 0;
  for (const ch of String(s ?? '')) n += WIDE.test(ch) ? 1.9 : 1;
  return n;
}

export function nodeMeta(node) {
  const part = partOf(node);
  // Mono lines under the label: the part number (threats have none), then a
  // schema part's fields (severity has its own tag), or else the hardware
  // address and rail. A custom part shows all of them. A part marked `trio`
  // keeps the address and rail even though it has fields — its fields are
  // extra data (the power budget's currents), not a replacement identity.
  // At most three lines.
  const lines = [];
  if (!part.threat) lines.push(['sublabel', node.sublabel]);
  if (part.custom) {
    lines.push(['addr', node.addr], ['rail', node.rail]);
    for (const fd of part.fields || []) lines.push([`fields.${fd.id}`, node.fields?.[fd.id]]);
  } else if (part.fields && !part.trio) {
    for (const fd of part.fields) if (fd.id !== 'severity') lines.push([`fields.${fd.id}`, node.fields?.[fd.id]]);
  } else {
    lines.push(['addr', node.addr], ['rail', node.rail]);
  }
  return lines
    .map(([field, v]) => ({ field, text: String(v ?? '').trim() }))
    .filter((m) => m.text)
    .slice(0, 3);
}

// Process-flow shapes size like net_draw's: the label sets the width within
// 96–290 (decisions and slanted shapes get extra room), heights are fixed per
// shape, and a connector is a circle just big enough for its letter.
function shapeSize(shape, label) {
  const L = textUnits(label);
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
  const part = partOf(node);
  if (part.shape) return shapeSize(part.shape, String(node.label ?? ''));
  const meta = nodeMeta(node);
  const need = Math.max(
    NODE_W,
    textUnits(node.label) * 6.8 + 24,
    ...meta.map((m) => textUnits(m.text) * 5.9 + 26),
  );
  let w = Math.min(NODE_MAX_W, need);
  let h = NODE_H + meta.length * META_LINE_H;
  if (part.custom) {
    const on = (side) => part.ports.filter((p) => p.side === side).length;
    h = Math.max(h, PORT_GAP_Y * (Math.max(on('left'), on('right')) + 1));
    w = Math.max(w, Math.min(NODE_MAX_W, PORT_GAP_X * (Math.max(on('top'), on('bottom')) + 1)));
  }
  return { w, h };
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

// Tokenizes for wrapText: a run of non-whitespace, non-CJK characters is one
// token (a Latin word stays whole), but every CJK character (the same
// code-point classes `textUnits` counts) is its own token, so a Chinese
// sentence with no spaces can still wrap. Each token remembers whether
// whitespace preceded it in the source, so a token adjacent to a CJK
// character with no whitespace between them (`ESP32-S3轮询`) never gains
// one on reassembly. A token's `space` is only ever read once it is joined
// onto a non-empty line (`wrapText` always takes an empty line's token
// verbatim), so the very first token's flag is moot regardless of any
// leading whitespace in the source.
function tokenizeForWrap(s) {
  const tokens = [];
  let i = 0;
  let spacePending = false;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { spacePending = true; i++; continue; }
    if (WIDE.test(ch)) {
      tokens.push({ text: ch, space: spacePending });
      spacePending = false; i++;
      continue;
    }
    let j = i;
    while (j < s.length && !/\s/.test(s[j]) && !WIDE.test(s[j])) j++;
    tokens.push({ text: s.slice(i, j), space: spacePending });
    spacePending = false;
    i = j;
  }
  return tokens;
}

// CJK closing punctuation: never allowed to start a wrapped line. Membership
// requires WIDE, so every mark here is a token of its own and the carry below
// can only ever fire on text that holds CJK — the ASCII path is unchanged by
// construction. (The Latin curly quotes ”’ are deliberately not members: they
// close Latin text, where a carry would have to cut into a word.)
const CLOSING_PUNCT = new Set([...'。，、；：？！）」』》'].filter((ch) => WIDE.test(ch)));

// How many closing-punctuation tokens end `toks`. Every closing mark is WIDE,
// so it is always its own token and a run is measured token by token.
function trailingPunctRun(toks) {
  let k = 0;
  while (k < toks.length && CLOSING_PUNCT.has(toks[toks.length - 1 - k].text)) k++;
  return k;
}

// Renders a line's tokens back to text: a token joins with a space only where
// the source had whitespace, and the first token never takes one — it starts
// the line.
function joinTokens(toks) {
  let s = '';
  for (let i = 0; i < toks.length; i++) s += (i && toks[i].space ? ' ' : '') + toks[i].text;
  return s;
}

export function wrapText(text, maxChars = 22) {
  const tokens = tokenizeForWrap(String(text));
  if (!tokens.length) return [''];
  const lines = [];
  // A line is built as its token list, so the carry below can move whole
  // tokens: slicing the rendered text by code point would cut a Latin word
  // in half ("CSI、" → "CS" / "I、").
  let line = [];
  let rendered = '';
  for (const tok of tokens) {
    const candidate = rendered + (line.length && tok.space ? ' ' : '') + tok.text;
    if (line.length && textUnits(candidate) > maxChars) {
      // Don't start the new line with closing punctuation: carry the run of
      // marks already stuck to the finished line's end, plus exactly one
      // token before it (a whole Latin word or a single CJK character), down
      // to join the incoming mark. The finished line only gets shorter, so it
      // still fits its budget; if the carry would leave it empty, break
      // plainly instead.
      const k = CLOSING_PUNCT.has(tok.text) ? trailingPunctRun(line) : -1;
      const keep = line.length - (k + 1);
      if (k >= 0 && keep > 0) {
        lines.push(joinTokens(line.slice(0, keep)));
        line = [...line.slice(keep), tok];
      } else {
        lines.push(rendered);
        line = [tok];
      }
      rendered = joinTokens(line);
    } else {
      line.push(tok);
      rendered = candidate;
    }
  }
  if (line.length) lines.push(rendered);
  return lines;
}

// ---- Swimlanes ----
export const LANE_TITLE_H = 26;
const LANE_SNAP = 18;

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

// Shared by rendering and layout checks: a label's geometry must have one owner.
export function wireLabelRect(wire, geo, lane = 0) {
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const label = wire.label || (wire.style === 'sneakernet' ? '\u{1F45F} air gap' : (bus.silent ? '' : bus.short));
  const w = Math.round((textUnits(label) * 6.4 + 18) * 100) / 100;
  const t = Math.min(0.8, Math.max(0.2, 0.5 + (lane / WIRE_FAN) * 0.15));
  const at = lane ? curvePoint(geo, t) : geo.mid;
  return { label, at, x: Math.round((at.x - w / 2) * 100) / 100, y: Math.round((at.y - 10) * 100) / 100, w, h: 20 };
}
