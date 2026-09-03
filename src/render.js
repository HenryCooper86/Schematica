import { BUSES } from './buses.js';
import { getPart, CATEGORY_COLORS } from './palette.js';
import {
  portPosition, wireGeom, wireGeomToPoint, wireLanes, curvePoint, wrapText, noteHeight,
  NOTE_W, LANE_TITLE_H,
} from './geometry.js';

// The canvas mirrors net_draw's look one to one: gradient cards with a drop
// shadow and hairline border, a single slate stroke for every wire, neutral
// label pills, marker arrowheads, and CSS-driven hover and flow animation.

export const CANVAS_BG = '#0a0e17';

const ACCENT = '#38bdf8';
const TEXT = '#cbd5e1';
const META = '#7d8fae';
const CHIP_BG = '#0d1526';
const CARD_LINE = 'rgba(148,163,184,0.2)';
const MONO = 'ui-monospace, Consolas, monospace';

const WIRE = '#526180';
const WIRE_SEL = '#7dd3fc';
const WIRE_SNEAK = '#6b6242';
const LABEL_BG = '#0c1424';
const LABEL_LINE = '#24304d';
const LABEL_TEXT = '#8fa3c0';

const DASH = { dashed: '8 6', dotted: '2 5', sneakernet: '1 9', flow: '6 8' };

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Shared <defs>: the live canvas and every export embed the same set, so
// arrowheads, card shading, and the grid look identical in both.
export function defsMarkup() {
  return '<pattern id="gridpat" width="26" height="26" patternUnits="userSpaceOnUse">'
    + '<circle cx="1.2" cy="1.2" r="1.2" fill="#1b2742"/></pattern>'
    + '<linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#1c2537"/><stop offset="1" stop-color="#141b2b"/></linearGradient>'
    + '<filter id="nodeShadow" x="-40%" y="-40%" width="180%" height="180%">'
    + '<feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity="0.42"/></filter>'
    + '<marker id="arrow" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6.5" markerHeight="6.5"'
    + ' orient="auto-start-reverse"><path d="M0.5 1.2 L8.5 5 L0.5 8.8 z" fill="context-stroke"/></marker>';
}

// ---- Animation timing ----
// Live motion is CSS (see style.css); these functions bake the same state
// into attributes for export frames and recorded video. Every period divides
// LOOP_MS, so a LOOP_MS cycle returns each attribute to its exact start —
// that is what makes the seamless-loop GIF seamless.
export const LOOP_MS = 6000;
const FLOW_PERIOD_MS = 750;
const FLOW_CYCLE = 28;
const PULSE_MS = 1500;
const FOOTSTEP_MS = 2000;

export function flowOffset(nowMs) {
  return -Math.round(((nowMs / FLOW_PERIOD_MS) % 1) * FLOW_CYCLE * 100) / 100 + 0;
}

function pulseOpacity(nowMs) {
  return (0.22 + 0.63 * (0.5 - 0.5 * Math.cos((2 * Math.PI * nowMs) / PULSE_MS))).toFixed(3);
}

function blinkOpacity(nowMs) {
  return (0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * nowMs) / PULSE_MS))).toFixed(3);
}

function footstepPoint(geo, nowMs, j) {
  const walk = (nowMs % FOOTSTEP_MS) / FOOTSTEP_MS;
  const p = curvePoint(geo, (walk + j / 3) % 1);
  return { x: p.x, y: Math.round((p.y + 3.5) * 100) / 100 };
}

function parseGeo(s) {
  const n = s.split(',').map(Number);
  return {
    p1: { x: n[0], y: n[1] }, c1: { x: n[2], y: n[3] }, c2: { x: n[4], y: n[5] }, p2: { x: n[6], y: n[7] },
  };
}

// Move the air-gap footprints along their wires (the one animation CSS
// cannot express); the live ticker calls this while a sneakernet wire flows.
export function stepFootsteps(root, nowMs) {
  for (const g of root.querySelectorAll('.wire[data-g]')) {
    const geo = parseGeo(g.getAttribute('data-g'));
    g.querySelectorAll('.footstep').forEach((el, j) => {
      const p = footstepPoint(geo, nowMs, j);
      el.setAttribute('x', p.x);
      el.setAttribute('y', p.y);
    });
  }
}

// Freeze a cloned canvas at time `nowMs` for rasterizing: editor-only port
// dots go, and every CSS-animated value becomes a plain attribute.
export function bakeFrame(root, nowMs) {
  root.querySelectorAll('.ports').forEach((el) => el.remove());
  const off = flowOffset(nowMs);
  root.querySelectorAll('.vis.anim').forEach((el) => el.setAttribute('stroke-dashoffset', off));
  const halo = pulseOpacity(nowMs);
  root.querySelectorAll('.fxhalo').forEach((el) => el.setAttribute('stroke-opacity', halo));
  const blink = blinkOpacity(nowMs);
  root.querySelectorAll('.blink').forEach((el) => el.setAttribute('opacity', blink));
  stepFootsteps(root, nowMs);
}

// ---- Nodes ----

function badgeMarkup(x, y, size, color, icon) {
  const c = esc(color);
  const pad = size * 0.2;
  const k = (size - pad * 2) / 16;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.3)}" fill="${c}" opacity="0.13"/>`
    + `<g transform="translate(${x + pad} ${y + pad}) scale(${k})" fill="none" stroke="${c}"`
    + ` stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></g>`;
}

function portsMarkup(node, part, acc) {
  const local = { x: 0, y: 0, w: node.w, h: node.h };
  let s = '<g class="ports">';
  for (const port of part.ports) {
    const pos = portPosition(local, port);
    const bus = BUSES[port.bus];
    s += `<g class="portg" data-node="${esc(node.id)}" data-port="${esc(port.id)}">`
      + `<circle class="port" cx="${pos.x}" cy="${pos.y}" r="5" fill="${CHIP_BG}" stroke="${esc(acc)}" stroke-width="1.6"/>`
      + `<text class="port-name" x="${pos.x}" y="${pos.y - 11}" text-anchor="middle" font-size="9.5" font-weight="600"`
      + ` font-family="${MONO}" fill="#7dd3fc" paint-order="stroke" stroke="${CANVAS_BG}" stroke-width="3"`
      + ` pointer-events="none">${esc(port.name)} · ${esc(bus ? bus.short : '')}</text></g>`;
  }
  return s + '</g>';
}

const STATUS_META = {
  planned: { label: 'PLANNED', color: '#94a3b8' },
  prototype: { label: 'PROTO', color: '#f59e0b' },
  tested: { label: 'TESTED', color: '#38bdf8' },
  production: { label: 'PROD', color: '#34d399' },
  deprecated: { label: 'DEPRECATED', color: '#f87171' },
};

const FLAG_META = {
  bug: { label: 'BUG', color: '#f87171' },
  thermal: { label: 'HOT', color: '#fb923c' },
  power: { label: 'PWR!', color: '#facc15' },
  lead: { label: 'LEAD', color: '#94a3b8' },
  safety: { label: 'SAFE', color: '#38bdf8' },
  eol: { label: 'EOL', color: '#e879f9' },
};

// Status and flag tags sit on the card's top edge like net_draw's disposition
// tag, right-aligned. On narrow cards trailing flags drop before the status.
function tagChipsMarkup(node, animating, now) {
  const tags = [];
  if (node.status && STATUS_META[node.status]) tags.push({ ...STATUS_META[node.status], status: node.status });
  for (const f of node.flags || []) {
    if (FLAG_META[f]) tags.push(FLAG_META[f]);
  }
  if (!tags.length) return '';
  const keep = [];
  let used = 0;
  for (const tag of tags) {
    const w = tag.label.length * 5.4 + 14;
    if (used + (keep.length ? 4 : 0) + w > node.w - 6) break;
    used += (keep.length ? 4 : 0) + w;
    keep.push({ ...tag, w });
  }
  let s = '';
  let cx = node.w;
  for (const tag of keep.reverse()) {
    const { w } = tag;
    cx -= w;
    const blink = animating && tag.status === 'deprecated'
      ? ` class="blink"${now != null ? ` opacity="${blinkOpacity(now)}"` : ''}`
      : '';
    s += `<g${blink}><rect x="${cx}" y="-8" width="${w}" height="16" rx="8"`
      + ` fill="${CHIP_BG}" stroke="${tag.color}" stroke-opacity="0.8" stroke-width="1.2"/>`
      + `<text x="${cx + w / 2}" y="3.2" text-anchor="middle" font-size="8" font-weight="700"`
      + ` letter-spacing="0.5" fill="${tag.color}" pointer-events="none">${tag.label}</text></g>`;
    cx -= 4;
  }
  return s;
}

function nodeMarkup(node, selected, ui, animating, now) {
  const part = getPart(node.kind);
  const acc = node.color || CATEGORY_COLORS[part.category] || ACCENT;
  const W = node.w;
  const H = node.h;
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node" transform="translate(${node.x} ${node.y})">`;
  const flags = node.flags || [];
  const haloColor = flags.includes('bug') ? '#f87171' : (flags.includes('thermal') ? '#fb923c' : null);
  if (animating && haloColor) {
    s += `<rect class="fxhalo" x="-4" y="-4" width="${W + 8}" height="${H + 8}" rx="17" fill="none"`
      + ` stroke="${haloColor}" stroke-width="2.2"${now != null ? ` stroke-opacity="${pulseOpacity(now)}"` : ''}/>`;
  }
  if (selected) {
    s += `<rect x="-5" y="-5" width="${W + 10}" height="${H + 10}" rx="18" fill="none"`
      + ` stroke="${esc(acc)}" stroke-opacity="0.4" stroke-width="1.6"/>`;
  }
  s += `<rect class="card" width="${W}" height="${H}" rx="14" fill="url(#cardGrad)"`
    + ` stroke="${selected ? esc(acc) : CARD_LINE}" stroke-width="${selected ? 1.6 : 1}" filter="url(#nodeShadow)"/>`;
  if (H >= 78) {
    const badge = 34;
    s += badgeMarkup(W / 2 - badge / 2, 9, badge, acc, part.icon);
    const ty = 9 + badge + 15;
    s += `<text x="${W / 2}" y="${ty}" text-anchor="middle" font-size="11.5" font-weight="600"`
      + ` fill="${TEXT}" data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${W / 2}" y="${ty + 13.5}" text-anchor="middle" font-size="9.5"`
        + ` font-family="${MONO}" fill="${META}" data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  } else {
    const badge = 30;
    const bx = 10;
    const by = H / 2 - badge / 2;
    s += badgeMarkup(bx, by, badge, acc, part.icon);
    const tx = bx + badge + 10;
    const ty = H / 2 + (node.sublabel ? -3 : 4);
    s += `<text x="${tx}" y="${ty}" font-size="11.5" font-weight="600" fill="${TEXT}"`
      + ` data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${tx}" y="${ty + 13.5}" font-size="9.5" font-family="${MONO}" fill="${META}"`
        + ` data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  }
  s += tagChipsMarkup(node, animating, now);
  if (ui.ports !== false) s += portsMarkup(node, part, acc);
  s += '</g>';
  return s;
}

// ---- Wires ----

const geoData = (geo) => [geo.p1, geo.c1, geo.c2, geo.p2].map((p) => `${p.x},${p.y}`).join(',');

function wireMarkup(byId, wire, lane, selected, ui, animating, now) {
  const a = byId.get(wire.from.node);
  const b = byId.get(wire.to.node);
  if (!a || !b) return '';
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const geo = wireGeom(a, b, lane);
  const sneak = wire.style === 'sneakernet';
  // Per-wire override: 'on' animates even with the global toggle off, 'off'
  // never animates, null follows the toggle. Traffic on an air gap is a pair
  // of footprints walking the path instead of a moving dash.
  const wants = wire.flow === 'on' || (wire.flow !== 'off' && animating);
  const flowing = wants && !sneak && bus.flows;
  const dash = DASH[wire.style] || (flowing ? DASH.flow : null);
  const stroke = selected ? WIRE_SEL : (sneak ? WIRE_SNEAK : WIRE);
  const width = selected ? 2.4 : (sneak ? 1.5 : 2);
  let s = `<g class="wire${selected ? ' sel' : ''}" data-id="${esc(wire.id)}" data-type="wire"`
    + `${sneak ? ` data-g="${geoData(geo)}"` : ''}>`;
  s += `<path d="${geo.d}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke"/>`;
  s += `<path class="vis${flowing ? ' anim' : ''}" d="${geo.d}" fill="none" stroke="${stroke}"`
    + ` stroke-width="${width}" stroke-linecap="round"`
    + (dash ? ` stroke-dasharray="${dash}"` : '')
    + (flowing && now != null ? ` stroke-dashoffset="${flowOffset(now)}"` : '')
    + (wire.arrow === 'fwd' || wire.arrow === 'both' ? ' marker-end="url(#arrow)"' : '')
    + (wire.arrow === 'both' ? ' marker-start="url(#arrow)"' : '')
    + ' pointer-events="none"/>';
  if (wants && sneak) {
    for (let j = 0; j < 3; j++) {
      const p = footstepPoint(geo, now ?? 0, j);
      s += `<text class="footstep" x="${p.x}" y="${p.y}" text-anchor="middle" font-size="10"`
        + ' pointer-events="none">\u{1F463}</text>';
    }
  }
  const label = wire.label || (sneak ? '\u{1F45F} air gap' : bus.short);
  const w = Math.round((label.length * 6.4 + 18) * 100) / 100;
  s += `<rect x="${Math.round((geo.mid.x - w / 2) * 100) / 100}" y="${geo.mid.y - 10}" width="${w}" height="20" rx="9"`
    + ` fill="${LABEL_BG}" stroke="${LABEL_LINE}" stroke-width="1"/>`;
  s += `<text x="${geo.mid.x}" y="${geo.mid.y + 3.6}" text-anchor="middle" font-size="10.5" fill="${LABEL_TEXT}"`
    + ` data-edit="label">${esc(label)}</text>`;
  s += '</g>';
  return s;
}

// ---- Zones ----

// Styled after net_draw's swimlanes: a slim title band, a narrow label gutter
// with rotated lane names (horizontal orientation), subtle alternating lane
// tints, and solid hairline dividers.
const LANE_GUTTER = 20;

function swimlaneMarkup(zone, selected) {
  const color = esc(zone.color || '#a78bfa');
  const lanes = zone.lanes && zone.lanes.length ? zone.lanes : ['Lane 1'];
  const vertical = zone.orient === 'v';
  const bodyY = zone.y + LANE_TITLE_H;
  const bodyH = zone.h - LANE_TITLE_H;
  let s = `<g class="zone swimlane" data-id="${esc(zone.id)}" data-type="zone">`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="4"`
    + ` fill="${color}" fill-opacity="0.04" stroke="${selected ? ACCENT : color}"`
    + ` stroke-opacity="${selected ? 1 : 0.75}" stroke-width="${selected ? 2 : 1.5}"`
    + ' pointer-events="none"/>';
  // Alternating lane tints, then dividers, then labels.
  lanes.forEach((lane, i) => {
    if (i % 2 === 1) {
      const band = vertical
        ? `x="${zone.x + (i * zone.w) / lanes.length}" y="${bodyY}" width="${zone.w / lanes.length}" height="${bodyH}"`
        : `x="${zone.x}" y="${bodyY + (i * bodyH) / lanes.length}" width="${zone.w}" height="${bodyH / lanes.length}"`;
      s += `<rect ${band} fill="${color}" fill-opacity="0.05" pointer-events="none"/>`;
    }
  });
  lanes.forEach((lane, i) => {
    if (i > 0) {
      const pos = vertical
        ? `x1="${zone.x + (i * zone.w) / lanes.length}" y1="${bodyY}" x2="${zone.x + (i * zone.w) / lanes.length}" y2="${zone.y + zone.h}"`
        : `x1="${zone.x}" y1="${bodyY + (i * bodyH) / lanes.length}" x2="${zone.x + zone.w}" y2="${bodyY + (i * bodyH) / lanes.length}"`;
      s += `<line class="lane-divider" ${pos} stroke="${color}" stroke-opacity="0.3"/>`;
    }
    if (vertical) {
      const lx = zone.x + ((i + 0.5) * zone.w) / lanes.length;
      s += `<text x="${lx}" y="${bodyY + 11}" text-anchor="middle" dominant-baseline="central"`
        + ` font-size="9" font-family="${MONO}" fill="${color}" fill-opacity="0.7"`
        + ` pointer-events="none">${esc(lane)}</text>`;
    } else {
      const ly = bodyY + ((i + 0.5) * bodyH) / lanes.length;
      const lx = zone.x + LANE_GUTTER / 2 + 1;
      s += `<text transform="rotate(-90 ${lx} ${ly})" x="${lx}" y="${ly}" text-anchor="middle"`
        + ` dominant-baseline="central" font-size="9" font-family="${MONO}" fill="${color}"`
        + ` fill-opacity="0.7" pointer-events="none">${esc(lane)}</text>`;
    }
  });
  // Label gutter separator (left for rows, under the labels for columns).
  const gutter = vertical
    ? `x1="${zone.x}" y1="${bodyY + LANE_GUTTER}" x2="${zone.x + zone.w}" y2="${bodyY + LANE_GUTTER}"`
    : `x1="${zone.x + LANE_GUTTER}" y1="${bodyY}" x2="${zone.x + LANE_GUTTER}" y2="${zone.y + zone.h}"`;
  s += `<line ${gutter} stroke="${color}" stroke-opacity="0.3"/>`;
  s += `<line x1="${zone.x}" y1="${bodyY}" x2="${zone.x + zone.w}" y2="${bodyY}"`
    + ` stroke="${color}" stroke-opacity="0.55"/>`;
  s += `<text x="${zone.x + zone.w / 2}" y="${zone.y + LANE_TITLE_H / 2 + 1}" text-anchor="middle"`
    + ` dominant-baseline="central" font-size="10.5" font-weight="700" letter-spacing="1"`
    + ` fill="${color}" data-edit="label">${esc(zone.label || 'Process')}</text>`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="4"`
    + ' fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>';
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${LANE_TITLE_H}"`
    + ' fill="transparent" stroke="none"/>';
  s += '</g>';
  return s;
}

function zoneMarkup(zone, selected) {
  if (zone.kind === 'swimlane') return swimlaneMarkup(zone, selected);
  const color = zone.color || '#4a90d9';
  let s = `<g class="zone" data-id="${esc(zone.id)}" data-type="zone">`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="${esc(color)}" fill-opacity="0.06" stroke="none" pointer-events="none"/>`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="none" stroke="${selected ? ACCENT : esc(color)}" stroke-opacity="${selected ? 1 : 0.8}"`
    + ` stroke-width="${selected ? 2 : 1.5}"${selected ? '' : ' stroke-dasharray="6 5"'}/>`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  const label = zone.label || 'Zone';
  const w = label.length * 6.2 + 18;
  s += `<rect x="${zone.x + 12}" y="${zone.y - 9}" width="${w}" height="18" rx="9"`
    + ` fill="${CHIP_BG}" stroke="${esc(color)}" stroke-opacity="0.8"/>`;
  s += `<text x="${zone.x + 12 + w / 2}" y="${zone.y}" text-anchor="middle" dominant-baseline="central"`
    + ` font-size="10" font-weight="700" fill="${esc(color)}" data-edit="label">${esc(label)}</text>`;
  s += '</g>';
  return s;
}

function noteMarkup(note, selected) {
  const lines = wrapText(note.text);
  const h = noteHeight(note.text);
  let s = `<g class="note" data-id="${esc(note.id)}" data-type="note">`;
  s += `<rect x="${note.x}" y="${note.y}" width="${NOTE_W}" height="${h}" rx="8"`
    + ` fill="#1c1710" stroke="${selected ? ACCENT : '#8a6d3b'}" stroke-width="${selected ? 2 : 1}"/>`;
  lines.forEach((line, i) => {
    s += `<text x="${note.x + 10}" y="${note.y + 20 + i * 16}" font-size="11.5" fill="#e8c884"`
      + `${i === 0 ? ' data-edit="text"' : ''}>${esc(line)}</text>`;
  });
  s += '</g>';
  return s;
}

// ui: { selection, animate, now, ports }. With `animate`, flowing wires and
// flagged cards carry their animation classes; with a finite `now` the frame
// is also baked into attributes (exports). Live rendering passes no `now`.
export function diagramMarkup(doc, ui = {}) {
  const sel = ui.selection || new Set();
  const animating = !!ui.animate;
  const now = Number.isFinite(ui.now) ? ui.now : null;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const lanes = wireLanes(doc.wires);
  const zones = doc.zones.map((z) => zoneMarkup(z, sel.has(z.id))).join('');
  const wires = doc.wires.map((w) => wireMarkup(byId, w, lanes.get(w.id) || 0, sel.has(w.id), ui, animating, now)).join('');
  const nodes = doc.nodes.map((n) => nodeMarkup(n, sel.has(n.id), ui, animating, now)).join('');
  const notes = doc.notes.map((n) => noteMarkup(n, sel.has(n.id))).join('');
  return `<g class="layer-zones">${zones}</g><g class="layer-wires">${wires}</g>`
    + `<g class="layer-nodes">${nodes}</g><g class="layer-notes">${notes}</g>`;
}

// Transient editor feedback (marquee, zone preview, wire being dragged) lives
// in its own layer so pointer moves never rebuild the diagram.
export function overlayMarkup(doc, ui) {
  let s = '';
  if (ui.marquee) {
    const m = ui.marquee;
    s += m.kind === 'zone'
      ? `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="16" fill="${ACCENT}" fill-opacity="0.05"`
        + ` stroke="${ACCENT}" stroke-opacity="0.6" stroke-width="1.4" stroke-dasharray="10 7" vector-effect="non-scaling-stroke"/>`
      : `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="4" fill="${ACCENT}" fill-opacity="0.07"`
        + ` stroke="${ACCENT}" stroke-opacity="0.5" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  if (ui.wireDraft) {
    const { from, cursor } = ui.wireDraft;
    const node = doc.nodes.find((n) => n.id === from.node);
    if (node) {
      const geo = wireGeomToPoint(node, cursor);
      s += `<path d="${geo.d}" fill="none" stroke="${WIRE_SEL}" stroke-width="2" stroke-dasharray="6 6"`
        + ' stroke-linecap="round" opacity="0.9"/>'
        + `<circle cx="${geo.p2.x}" cy="${geo.p2.y}" r="4" fill="${WIRE_SEL}"/>`;
    }
  }
  return s;
}

export function createRenderer(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  svg.insertAdjacentHTML('afterbegin', `<defs>${defsMarkup()}</defs>`);
  const root = document.createElementNS(NS, 'g');
  const grid = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({
    x: -10000, y: -10000, width: 20000, height: 20000, fill: 'url(#gridpat)', 'pointer-events': 'none',
  })) grid.setAttribute(k, v);
  const diagram = document.createElementNS(NS, 'g');
  diagram.setAttribute('class', 'layer-diagram');
  const overlay = document.createElementNS(NS, 'g');
  overlay.setAttribute('class', 'layer-overlay');
  overlay.setAttribute('pointer-events', 'none');
  root.append(grid, diagram, overlay);
  svg.appendChild(root);
  return {
    setView(view, showGrid = true) {
      root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
      grid.setAttribute('display', showGrid ? 'inline' : 'none');
    },
    renderDiagram(doc, ui = {}) {
      diagram.innerHTML = diagramMarkup(doc, ui);
    },
    renderOverlay(doc, ui = {}) {
      overlay.innerHTML = overlayMarkup(doc, ui);
    },
    render(doc, view, ui = {}) {
      this.setView(view, ui.grid !== false);
      this.renderDiagram(doc, ui);
      this.renderOverlay(doc, ui);
    },
    step(nowMs) {
      stepFootsteps(diagram, nowMs);
    },
  };
}
