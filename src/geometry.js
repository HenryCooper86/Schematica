export function snap(v, grid = 8) {
  // "+ 0" folds the -0 that rounding small negatives produces into +0, so
  // snapped coordinates never serialize as "-0".
  return Math.round(v / grid) * grid + 0;
}

export function nodeRect(node) {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

export function portPosition(node, portDef) {
  const { side, offset } = portDef;
  if (side === 'left') return { x: node.x, y: node.y + node.h * offset };
  if (side === 'right') return { x: node.x + node.w, y: node.y + node.h * offset };
  if (side === 'top') return { x: node.x + node.w * offset, y: node.y };
  return { x: node.x + node.w * offset, y: node.y + node.h };
}

export function portNormal(side) {
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  }[side];
}

function controls(a, sideA, b, sideB) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const ext = Math.min(120, Math.max(30, dist * 0.4));
  const na = portNormal(sideA);
  const nb = portNormal(sideB);
  return [
    { x: a.x + na.x * ext, y: a.y + na.y * ext },
    { x: b.x + nb.x * ext, y: b.y + nb.y * ext },
  ];
}

export function wirePath(a, sideA, b, sideB) {
  const [c1, c2] = controls(a, sideA, b, sideB);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

export function wirePoint(a, sideA, b, sideB, t) {
  const [c1, c2] = controls(a, sideA, b, sideB);
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

export function wireMidpoint(a, sideA, b, sideB) {
  return wirePoint(a, sideA, b, sideB, 0.5);
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

export const NOTE_W = 160;

export function noteHeight(text) {
  return 16 + wrapText(text).length * 16;
}

export function contentBounds(doc, getPartFn = null) {
  const rects = [
    ...doc.nodes.map(nodeRect),
    ...doc.zones.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h })),
    ...doc.notes.map((n) => ({ x: n.x, y: n.y, w: NOTE_W, h: noteHeight(n.text) })),
  ];
  if (getPartFn) {
    const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
    for (const w of doc.wires) {
      const from = nodeById.get(w.from.node);
      const to = nodeById.get(w.to.node);
      if (!from || !to) continue;
      const pf = getPartFn(from.kind).ports.find((p) => p.id === w.from.port);
      const pt = getPartFn(to.kind).ports.find((p) => p.id === w.to.port);
      if (!pf || !pt) continue;
      const a = portPosition(from, pf);
      const b = portPosition(to, pt);
      const [c1, c2] = controls(a, pf.side, b, pt.side);
      for (const q of [a, b, c1, c2]) rects.push({ x: q.x, y: q.y, w: 0, h: 0 });
    }
  }
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
