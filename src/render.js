import { BUSES } from './buses.js';
import { getPart, CATEGORY_COLORS } from './palette.js';
import {
  portPosition, wirePath, wireMidpoint, wrapText, noteHeight, NOTE_W,
} from './geometry.js';

export const CANVAS_BG = '#0a0e17';

const ACCENT = '#38bdf8';
const CARD_BG = '#131a2b';
const CARD_LINE = '#2c3a5c';
const CHIP_BG = '#0d1220';
const TEXT = '#e6ebf4';
const MUTED = '#8b96ab';
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function badgeMarkup(x, y, size, color, icon) {
  const c = esc(color);
  const pad = size * 0.2;
  const k = (size - pad * 2) / 16;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="${c}" fill-opacity="0.13"/>`
    + `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="none" stroke="${c}" stroke-opacity="0.3"/>`
    + `<g transform="translate(${x + pad} ${y + pad}) scale(${k})" fill="none" stroke="${c}"`
    + ` stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></g>`;
}

function portsMarkup(node, part, hoverPort) {
  let s = '';
  for (const port of part.ports) {
    const pos = portPosition(node, port);
    const hot = hoverPort && hoverPort.node === node.id && hoverPort.port === port.id;
    s += `<circle class="port" data-node="${esc(node.id)}" data-port="${esc(port.id)}"`
      + ` cx="${pos.x}" cy="${pos.y}" r="${hot ? 6 : 4}"`
      + ` fill="${hot ? '#16324a' : CHIP_BG}" stroke="${hot ? ACCENT : '#46587a'}" stroke-width="1.5"/>`;
    if (hot) {
      const bus = BUSES[port.bus];
      s += `<text x="${pos.x}" y="${pos.y - 11}" text-anchor="middle" font-size="9.5" font-weight="600"`
        + ` font-family="${MONO}" fill="#7dd3fc" paint-order="stroke" stroke="${CANVAS_BG}" stroke-width="3"`
        + ` pointer-events="none">${esc(port.name)} · ${esc(bus ? bus.short : '')}</text>`;
    }
  }
  return s;
}

// Signal-flow speeds in px/s per bus; 0 = no flow animation (ground doesn't "flow").
const FLOW_SPEED = {
  power: 20, gnd: 0, i2c: 40, spi: 56, uart: 40, can: 44,
  usb: 56, eth: 64, gpio: 28, pwm: 48, adc: 32, rf: 64,
};

const FLOW_PERIOD = 24;

function pulsePhase(now, periodMs) {
  return 0.5 + 0.5 * Math.sin(((now % periodMs) / periodMs) * Math.PI * 2);
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

function tagChipsMarkup(node, anim) {
  const tags = [];
  if (node.status && STATUS_META[node.status]) tags.push({ ...STATUS_META[node.status], status: node.status });
  for (const f of node.flags || []) {
    if (FLAG_META[f]) tags.push(FLAG_META[f]);
  }
  if (!tags.length) return '';
  let s = '';
  let cx = node.x + node.w;
  for (const tag of tags.reverse()) {
    const w = tag.label.length * 5.5 + 10;
    if (cx - w < node.x + 6) break; // clamp: drop chips that would overhang narrow nodes
    cx -= w;
    const blink = anim != null && tag.status === 'deprecated'
      ? ` class="blink" opacity="${(0.45 + 0.55 * pulsePhase(anim, 1400)).toFixed(3)}"`
      : '';
    s += `<g${blink}><rect x="${cx}" y="${node.y - 8}" width="${w}" height="15" rx="7.5"`
      + ` fill="${CHIP_BG}" stroke="${tag.color}" stroke-opacity="0.7"/>`
      + `<text x="${cx + w / 2}" y="${node.y - 0.5}" text-anchor="middle" dominant-baseline="central"`
      + ` font-size="8" font-weight="700" font-family="${MONO}" fill="${tag.color}"`
      + ` pointer-events="none">${tag.label}</text></g>`;
    cx -= 4;
  }
  return s;
}

function nodeMarkup(node, selected, hoverPort, anim) {
  const part = getPart(node.kind);
  const color = node.color || CATEGORY_COLORS[part.category] || ACCENT;
  const badge = 26;
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node">`;
  s += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="12"`
    + ` fill="${CARD_BG}" stroke="${selected ? ACCENT : CARD_LINE}" stroke-width="1.5"/>`;
  if (node.h >= 78) {
    s += badgeMarkup(node.x + node.w / 2 - badge / 2, node.y + 10, badge, color, part.icon);
    const ty = node.y + 10 + badge + 16;
    s += `<text x="${node.x + node.w / 2}" y="${ty}" text-anchor="middle" font-size="12.5"`
      + ` font-weight="700" fill="${TEXT}" data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${node.x + node.w / 2}" y="${ty + 15}" text-anchor="middle" font-size="10"`
        + ` font-family="${MONO}" fill="${MUTED}" data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  } else {
    const bx = node.x + 10;
    const by = node.y + node.h / 2 - badge / 2;
    s += badgeMarkup(bx, by, badge, color, part.icon);
    const tx = bx + badge + 9;
    const ty = node.y + node.h / 2 + (node.sublabel ? -3 : 4);
    s += `<text x="${tx}" y="${ty}" font-size="12" font-weight="700" fill="${TEXT}"`
      + ` data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${tx}" y="${ty + 14}" font-size="9.5" font-family="${MONO}" fill="${MUTED}"`
        + ` data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  }
  const flags = node.flags || [];
  const pulseColor = flags.includes('bug') ? '#f87171' : (flags.includes('thermal') ? '#fb923c' : null);
  if (anim != null && pulseColor) {
    const phase = pulsePhase(anim, 1600);
    const grow = 3 + 3 * phase;
    s += `<rect class="pulse" x="${node.x - grow}" y="${node.y - grow}"`
      + ` width="${node.w + grow * 2}" height="${node.h + grow * 2}" rx="${12 + grow}"`
      + ` fill="none" stroke="${pulseColor}" stroke-opacity="${(0.12 + 0.3 * (1 - phase)).toFixed(3)}"`
      + ` stroke-width="4" pointer-events="none"/>`;
  }
  s += tagChipsMarkup(node, anim);
  if (selected) {
    // Drawn above the chips so the translucent glow tints rather than clips them.
    s += `<rect x="${node.x - 3}" y="${node.y - 3}" width="${node.w + 6}" height="${node.h + 6}" rx="15"`
      + ` fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="5" pointer-events="none"/>`;
  }
  s += portsMarkup(node, part, hoverPort);
  s += '</g>';
  return s;
}

function chipMarkup(cx, cy, label, color, editField) {
  const w = label.length * 6 + 16;
  return `<rect x="${cx - w / 2}" y="${cy - 9}" width="${w}" height="18" rx="9"`
    + ` fill="${CHIP_BG}" stroke="${color}" stroke-opacity="0.55"/>`
    + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="9.5"`
    + ` font-weight="600" font-family="${MONO}" fill="${color}"`
    + `${editField ? ` data-edit="${editField}"` : ''}>${esc(label)}</text>`;
}

function wireMarkup(doc, wire, selected, anim) {
  const from = doc.nodes.find((n) => n.id === wire.from.node);
  const to = doc.nodes.find((n) => n.id === wire.to.node);
  if (!from || !to) return '';
  const pf = getPart(from.kind).ports.find((q) => q.id === wire.from.port);
  const pt = getPart(to.kind).ports.find((q) => q.id === wire.to.port);
  if (!pf || !pt) return '';
  const a = portPosition(from, pf);
  const b = portPosition(to, pt);
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const d = wirePath(a, pf.side, b, pt.side);
  const mid = wireMidpoint(a, pf.side, b, pt.side);
  let s = `<g class="wire" data-id="${esc(wire.id)}" data-type="wire">`;
  s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  if (selected) {
    s += `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-opacity="0.3"`
      + ` stroke-width="${bus.width + 5}" stroke-linecap="round" pointer-events="none"/>`;
  }
  s += `<path d="${d}" fill="none" stroke="${bus.color}" stroke-width="${bus.width}"`
    + `${bus.dash ? ` stroke-dasharray="${bus.dash}"` : ''} stroke-linecap="round" pointer-events="none"/>`;
  const speed = FLOW_SPEED[wire.bus] ?? 32;
  if (anim != null && speed > 0) {
    const offset = -(((anim / 1000) * speed) % FLOW_PERIOD);
    s += `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.55"`
      + ` stroke-width="${Math.max(1.5, bus.width - 0.5)}" stroke-linecap="round"`
      + ` stroke-dasharray="2.5 ${FLOW_PERIOD - 2.5}" stroke-dashoffset="${offset.toFixed(2)}"`
      + ` pointer-events="none"/>`;
  }
  s += chipMarkup(mid.x, mid.y, wire.label || bus.short, bus.color, 'label');
  s += '</g>';
  return s;
}

function zoneMarkup(zone, selected) {
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

export function diagramMarkup(doc, ui = {}) {
  const sel = ui.selection || new Set();
  const anim = ui.animate && Number.isFinite(ui.now) ? ui.now : null;
  const zones = doc.zones.map((z) => zoneMarkup(z, sel.has(z.id))).join('');
  const wires = doc.wires.map((w) => wireMarkup(doc, w, sel.has(w.id), anim)).join('');
  const nodes = doc.nodes.map((n) => nodeMarkup(n, sel.has(n.id), ui.hoverPort, anim)).join('');
  const notes = doc.notes.map((n) => noteMarkup(n, sel.has(n.id))).join('');
  return `<g class="layer-zones">${zones}</g><g class="layer-wires">${wires}</g>`
    + `<g class="layer-nodes">${nodes}</g><g class="layer-notes">${notes}</g>`;
}

function oppositeSide(side) {
  return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side];
}

function overlayMarkup(doc, ui) {
  let s = '<g class="layer-overlay" pointer-events="none">';
  if (ui.marquee) {
    const m = ui.marquee;
    s += `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}"`
      + ` fill="${ACCENT}" fill-opacity="0.08" stroke="${ACCENT}" stroke-dasharray="4 3"/>`;
  }
  if (ui.wireDraft) {
    const { from, cursor } = ui.wireDraft;
    const node = doc.nodes.find((n) => n.id === from.node);
    const pd = node ? getPart(node.kind).ports.find((q) => q.id === from.port) : null;
    if (node && pd) {
      const a = portPosition(node, pd);
      s += `<path d="${wirePath(a, pd.side, cursor, oppositeSide(pd.side))}" fill="none"`
        + ` stroke="${ACCENT}" stroke-width="2" stroke-dasharray="6 4"/>`;
    }
  }
  s += '</g>';
  return s;
}

function gridMarkup() {
  return '<rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#gridpat)" pointer-events="none"/>';
}

export function createRenderer(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(NS, 'g');
  svg.appendChild(root);
  return {
    render(doc, view, ui = {}) {
      root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
      let inner = '';
      if (ui.grid !== false) inner += gridMarkup();
      inner += diagramMarkup(doc, ui);
      inner += overlayMarkup(doc, ui);
      root.innerHTML = inner;
    },
  };
}
