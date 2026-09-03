import { BUSES } from './buses.js';
import { getPart, CATEGORY_COLORS, DISPOSITIONS, SEVERITY_COLORS } from './palette.js';
import {
  portPosition, wireGeom, wireGeomToPoint, wireLanes, curvePoint, wrapText, noteHeight,
  nodeRect, nodeSize, nodeMeta, NOTE_W, LANE_TITLE_H, WIRE_FAN,
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
  root.querySelectorAll('.fxhalo.anim').forEach((el) => el.setAttribute('stroke-opacity', halo));
  const blink = blinkOpacity(nowMs);
  root.querySelectorAll('.blink').forEach((el) => el.setAttribute('opacity', blink));
  stepFootsteps(root, nowMs);
}

// ---- Nodes ----
// A net_draw card: 104x74 at minimum, grown by the label and up to three mono
// meta lines; a 38px tinted badge on top, the label under it, meta below. The
// status tag sits top-left and flag badges run along the top-right edge.

// Part icons live in a 16-unit box; net_draw draws its 24-unit icons at 1.15x
// with a 1.8px stroke, so scale ours to the same 27.6px glyph and stroke.
const ICON_SCALE = 27.6 / 16;

// net_draw types carry their original 24-box glyph markup, drawn at net_draw's
// own 1.15 scale; Schematica parts carry a 16-box path scaled to match.
function badgeMarkup(W, color, part) {
  const c = esc(color);
  let s = `<rect x="${W / 2 - 19}" y="8" width="38" height="38" rx="11" fill="${c}" opacity="0.13"/>`;
  if (part.glyph) {
    s += `<g transform="translate(${W / 2 - 13.8} 13.2) scale(1.15)" fill="none" stroke="${c}" stroke-width="1.8"`
      + ` stroke-linecap="round" stroke-linejoin="round" color="${c}">${part.glyph}</g>`;
  } else {
    s += `<g transform="translate(${W / 2 - 13.8} 13.2) scale(${ICON_SCALE})" fill="none" stroke="${c}"`
      + ` stroke-width="${(1.8 / ICON_SCALE).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"><path d="${part.icon}"/></g>`;
  }
  return s;
}

// Process-flow shapes (net_draw): the shape is the card, label centered inside.
function shapeMarkup(part, W, H, acc, selected) {
  const style = `fill="url(#cardGrad)" stroke="${esc(acc)}" stroke-opacity="${selected ? 1 : 0.7}"`
    + ` stroke-width="${selected ? 1.8 : 1.4}" filter="url(#nodeShadow)"`;
  let s;
  switch (part.shape) {
    case 'terminator': s = `<rect class="card" width="${W}" height="${H}" rx="${H / 2}" ${style}/>`; break;
    case 'predefined': s = `<rect class="card" width="${W}" height="${H}" rx="6" ${style}/>`
      + `<path d="M10 0 V ${H} M ${W - 10} 0 V ${H}" stroke="${esc(acc)}" stroke-opacity="0.5" stroke-width="1.2" fill="none"/>`; break;
    case 'decision': s = `<polygon class="card" points="${W / 2},0 ${W},${H / 2} ${W / 2},${H} 0,${H / 2}" ${style}/>`; break;
    case 'data': s = `<polygon class="card" points="20,0 ${W},0 ${W - 20},${H} 0,${H}" ${style}/>`; break;
    case 'prep': s = `<polygon class="card" points="14,0 ${W - 14},0 ${W},${H / 2} ${W - 14},${H} 14,${H} 0,${H / 2}" ${style}/>`; break;
    case 'manual': s = `<polygon class="card" points="0,12 ${W},0 ${W},${H} 0,${H}" ${style}/>`; break;
    case 'delay': s = `<path class="card" d="M0 0 H ${W - H / 2} A ${H / 2} ${H / 2} 0 0 1 ${W - H / 2} ${H} H 0 Z" ${style}/>`; break;
    case 'document': s = `<path class="card" d="M0 0 H ${W} V ${H - 10} C ${W * 0.7} ${H - 22}, ${W * 0.3} ${H + 10}, 0 ${H - 8} Z" ${style}/>`; break;
    case 'connector': s = `<circle class="card" cx="${W / 2}" cy="${H / 2}" r="${W / 2}" ${style}/>`; break;
    default: s = `<rect class="card" width="${W}" height="${H}" rx="9" ${style}/>`;
  }
  return s;
}

function portsMarkup(node, part, acc, W, H) {
  const local = { x: 0, y: 0, w: W, h: H };
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

// Flags render like net_draw's effect badges: a ringed circle with a small
// icon on the card's top-right edge, and a halo around the card in the color
// of the most severe flag.
const FLAG_META = {
  bug: {
    label: 'Bug', color: '#f87171', sev: 3,
    icon: '<path d="M12 7.5a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0v-3a4 4 0 0 1 4-4z"/>'
      + '<path d="M12 7.5V5M8 12.5H5.5M18.5 12.5H16M8.6 16 6.5 18M15.4 16l2.1 2"/>',
  },
  thermal: {
    label: 'Thermal', color: '#fb923c', sev: 2,
    icon: '<path d="M12 3c1 3 4 4.6 4 8.5a4 4 0 0 1-8 0c0-1.5.5-2.6 1.2-3.4.3 1 .9 1.7 1.8 1.9C11 8 11 5.5 12 3z"/>',
  },
  power: {
    label: 'Power hungry', color: '#facc15', sev: 2,
    icon: '<path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5z"/>',
  },
  lead: {
    label: 'Long lead time', color: '#94a3b8', sev: 1,
    icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  },
  safety: {
    label: 'Safety critical', color: '#38bdf8', sev: 1,
    icon: '<path d="M12 3 20 6v6c0 4.6-3.4 7.7-8 9-4.6-1.3-8-4.4-8-9V6z"/>',
  },
  eol: {
    label: 'EOL part', color: '#e879f9', sev: 1,
    icon: '<path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.6h.01"/>',
  },
};

// Tags along the top-left edge, in a row: lifecycle status, disposition,
// and severity. A deprecated part blinks while animating.
function tagsMarkup(node, animating, now) {
  const tags = [];
  const st = node.status && STATUS_META[node.status];
  if (st) tags.push({ label: st.label, color: st.color, blink: node.status === 'deprecated' });
  const disp = node.disposition && DISPOSITIONS[node.disposition];
  if (disp) tags.push({ label: disp.name.toUpperCase(), color: disp.color });
  const sev = node.fields?.severity;
  if (sev && SEVERITY_COLORS[sev]) tags.push({ label: sev.toUpperCase(), color: SEVERITY_COLORS[sev] });
  let s = '';
  let x = 10;
  for (const t of tags) {
    const pw = Math.round((t.label.length * 5.4 + 14) * 100) / 100;
    const blink = animating && t.blink
      ? ` class="blink"${now != null ? ` opacity="${blinkOpacity(now)}"` : ''}`
      : '';
    s += `<g${blink}><rect x="${x}" y="-8" width="${pw}" height="16" rx="8"`
      + ` fill="${CHIP_BG}" stroke="${t.color}" stroke-opacity="0.8" stroke-width="1.2"/>`
      + `<text x="${Math.round((x + pw / 2) * 100) / 100}" y="3.2" text-anchor="middle" font-size="8" font-weight="700"`
      + ` letter-spacing="0.5" fill="${t.color}" pointer-events="none">${esc(t.label)}</text></g>`;
    x = Math.round((x + pw + 4) * 100) / 100;
  }
  return s;
}

// Flag badges along the top-right edge; when they would run into the card,
// the overflow collapses into a "+N" badge (net_draw's effect badges).
function flagBadgesMarkup(flags, W) {
  const maxBadges = Math.max(1, Math.floor((W - 26) / 23));
  const shown = flags.length > maxBadges ? flags.slice(0, maxBadges - 1) : flags;
  let s = '';
  shown.forEach((k, i) => {
    const f = FLAG_META[k];
    const bx = W - 13 - i * 23;
    s += `<g class="fxbadge"><title>${esc(f.label)}</title>`
      + `<circle cx="${bx}" cy="0" r="10.5" fill="${CHIP_BG}" stroke="${f.color}" stroke-width="1.6"/>`
      + `<g transform="translate(${bx - 6.6} -6.6) scale(0.55)" fill="none" stroke="${f.color}"`
      + ` stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${f.icon}</g></g>`;
  });
  if (flags.length > shown.length) {
    const bx = W - 13 - shown.length * 23;
    const rest = flags.slice(shown.length).map((k) => FLAG_META[k].label).join(', ');
    s += `<g class="fxbadge"><title>${esc(rest)}</title>`
      + `<circle cx="${bx}" cy="0" r="10.5" fill="${CHIP_BG}" stroke="#8b9bb4" stroke-width="1.6"/>`
      + `<text x="${bx}" y="3.4" text-anchor="middle" font-size="9" font-weight="700" fill="#8b9bb4"`
      + ` pointer-events="none">+${flags.length - shown.length}</text></g>`;
  }
  return s;
}

// Disposition glow, like net_draw's effect halos: adversaries and suspicious
// objects pulse all the time, a victim wears a steady amber ring. Flags keep
// their halo (pulsing only while animating) when no glow outranks it.
const GLOW = {
  adversary: { color: '#ef4444', pulse: true },
  suspicious: { color: '#fb923c', pulse: true },
  victim: { color: '#fbbf24', pulse: false },
};

function haloMarkup(node, W, H, animating, now) {
  const flags = (node.flags || []).filter((f) => FLAG_META[f]);
  const glow = node.disposition && GLOW[node.disposition];
  let color;
  let pulse;
  if (glow && (glow.pulse || !flags.length)) {
    color = glow.color;
    pulse = glow.pulse;
  } else if (flags.length) {
    const worst = flags.reduce((a, k) => (FLAG_META[k].sev > FLAG_META[a].sev ? k : a), flags[0]);
    color = FLAG_META[worst].color;
    pulse = animating;
  } else {
    return '';
  }
  const opacity = pulse && now != null ? pulseOpacity(now) : '0.6';
  return `<rect class="fxhalo${pulse ? ' anim' : ''}" x="-4" y="-4" width="${W + 8}" height="${H + 8}" rx="17"`
    + ` fill="none" stroke="${color}" stroke-width="2.2" stroke-opacity="${opacity}"/>`;
}

function nodeMarkup(node, selected, ui, animating, now) {
  const part = getPart(node.kind);
  const acc = node.color || part.accent || CATEGORY_COLORS[part.category] || ACCENT;
  const { w: W, h: H } = nodeSize(node);
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node" transform="translate(${node.x} ${node.y})">`;
  const flags = (node.flags || []).filter((f) => FLAG_META[f]);
  s += haloMarkup(node, W, H, animating, now);
  if (selected) {
    s += `<rect x="-5" y="-5" width="${W + 10}" height="${H + 10}" rx="18" fill="none"`
      + ` stroke="${esc(acc)}" stroke-opacity="0.4" stroke-width="1.6"/>`;
  }
  if (part.shape) {
    s += shapeMarkup(part, W, H, acc, selected);
    s += `<text x="${W / 2}" y="${H / 2 + 4.2}" text-anchor="middle" font-size="12" font-weight="600"`
      + ` fill="#dbe4f0" data-edit="label">${esc(node.label)}</text>`;
  } else {
    // Threat types wear net_draw's dashed red border until selected.
    const threat = !!part.threat && !selected;
    s += `<rect class="card" width="${W}" height="${H}" rx="14" fill="url(#cardGrad)"`
      + ` stroke="${selected ? esc(acc) : (threat ? 'rgba(248,113,113,0.4)' : CARD_LINE)}"`
      + ` stroke-width="${selected ? 1.6 : 1}" filter="url(#nodeShadow)"${threat ? ' stroke-dasharray="5 3.5"' : ''}/>`;
    s += badgeMarkup(W, acc, part);
    s += `<text x="${W / 2}" y="62" text-anchor="middle" font-size="11.5" font-weight="600"`
      + ` fill="${TEXT}" data-edit="label">${esc(node.label)}</text>`;
    nodeMeta(node).forEach((m, i) => {
      s += `<text x="${W / 2}" y="${75 + i * 12.5}" text-anchor="middle" font-size="9.5" fill="${META}"`
        + ` font-family="${MONO}" data-edit="${m.field}">${esc(m.text)}</text>`;
    });
  }
  s += tagsMarkup(node, animating, now);
  s += flagBadgesMarkup(flags, W);
  if (ui.ports !== false) s += portsMarkup(node, part, acc, W, H);
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
  const geo = wireGeom(nodeRect(a), nodeRect(b), lane);
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
    + ` data-from="${esc(wire.from.node)}:${esc(wire.from.port)}" data-to="${esc(wire.to.node)}:${esc(wire.to.port)}"`
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
  const label = wire.label || (sneak ? '\u{1F45F} air gap' : (bus.silent ? '' : bus.short));
  const w = Math.round((label.length * 6.4 + 18) * 100) / 100;
  // Fanned wires stagger their pills along the curve: side by side the 22px
  // fan is narrower than a pill, so parallel vertical runs would collide.
  const t = Math.min(0.8, Math.max(0.2, 0.5 + (lane / WIRE_FAN) * 0.15));
  const at = lane ? curvePoint(geo, t) : geo.mid;
  if (label) {
    s += `<rect x="${Math.round((at.x - w / 2) * 100) / 100}" y="${Math.round((at.y - 10) * 100) / 100}" width="${w}" height="20" rx="9"`
      + ` fill="${LABEL_BG}" stroke="${LABEL_LINE}" stroke-width="1"/>`;
    s += `<text x="${at.x}" y="${Math.round((at.y + 3.6) * 100) / 100}" text-anchor="middle" font-size="10.5" fill="${LABEL_TEXT}"`
      + ` data-edit="label">${esc(label)}</text>`;
  }
  // A selected wire grows a handle at each end; dragging one onto another
  // port re-attaches that end (tools.js).
  if (selected) {
    for (const [end, p] of [['from', geo.p1], ['to', geo.p2]]) {
      s += `<circle class="whandle" data-wend="${end}" cx="${p.x}" cy="${p.y}" r="5" fill="${CHIP_BG}"`
        + ` stroke="${WIRE_SEL}" stroke-width="1.6"/>`;
    }
  }
  s += '</g>';
  return s;
}

// ---- Zones ----

// net_draw's corner handles: a selected zone or swimlane can be resized by
// dragging any corner (tools.js handles the drag).
function zoneHandlesMarkup(zone) {
  const corners = [
    ['nw', zone.x, zone.y], ['ne', zone.x + zone.w, zone.y],
    ['sw', zone.x, zone.y + zone.h], ['se', zone.x + zone.w, zone.y + zone.h],
  ];
  return corners.map(([c, cx, cy]) => (
    `<rect class="zhandle" data-zhandle="${c}" x="${cx - 5}" y="${cy - 5}" width="10" height="10" rx="3"`
    + ` fill="${CHIP_BG}" stroke="${WIRE_SEL}" stroke-width="1.5"`
    + ` cursor="${c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize'}"/>`
  )).join('');
}

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
  if (selected) s += zoneHandlesMarkup(zone);
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
  if (selected) s += zoneHandlesMarkup(zone);
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
      const geo = wireGeomToPoint(nodeRect(node), cursor);
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
