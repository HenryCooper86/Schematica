import { BUSES } from './buses.js';
import { getPart } from './palette.js';
import {
  portPosition, wirePath, wireMidpoint, wrapText, noteHeight, NOTE_W,
} from './geometry.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const GLYPHS = {
  compute: 'M3 3h10v10H3z M1 5h2 M1 8h2 M1 11h2 M13 5h2 M13 8h2 M13 11h2 M5 1v2 M8 1v2 M11 1v2 M5 13v2 M8 13v2 M11 13v2',
  sensors: 'M1 9 C 3 3, 5 3, 7 9 S 11 15, 13 9',
  actuators: 'M8 2v5 M4 5a6 6 0 1 0 8 0',
  power: 'M7 1 3 9h4l-1 6 5-8H7z',
  connectivity: 'M2 8a8 8 0 0 1 12 0 M4.5 10.5a4.5 4.5 0 0 1 7 0 M7.2 13h1.6',
  misc: 'M3 2h10v3.5H3z M3 6.5h10V10H3z M3 11h10v3H3z',
};

const SELECT_COLOR = '#2563eb';

function nodeMarkup(node, selected, hoverPort) {
  const part = getPart(node.kind);
  const stroke = selected ? SELECT_COLOR : '#334155';
  const fill = node.color || '#ffffff';
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node">`;
  s += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="10"`
    + ` fill="${esc(fill)}" stroke="${stroke}" stroke-width="${selected ? 2.5 : 1.5}"/>`;
  s += `<g transform="translate(${node.x + 8},${node.y + 8})" stroke="#64748b" fill="none" stroke-width="1.4">`
    + `<path d="${GLYPHS[part.category] || GLYPHS.misc}"/></g>`;
  const cy = node.y + node.h / 2;
  s += `<text x="${node.x + node.w / 2}" y="${cy - (node.sublabel ? 6 : 0)}" text-anchor="middle"`
    + ` dominant-baseline="middle" font-size="13" font-weight="600" fill="#0f172a" data-edit="label">${esc(node.label)}</text>`;
  if (node.sublabel) {
    s += `<text x="${node.x + node.w / 2}" y="${cy + 12}" text-anchor="middle" dominant-baseline="middle"`
      + ` font-size="11" fill="#475569" data-edit="sublabel">${esc(node.sublabel)}</text>`;
  }
  for (const port of part.ports) {
    const pos = portPosition(node, port);
    const hot = hoverPort && hoverPort.node === node.id && hoverPort.port === port.id;
    s += `<circle class="port" data-node="${esc(node.id)}" data-port="${esc(port.id)}"`
      + ` cx="${pos.x}" cy="${pos.y}" r="${hot ? 6.5 : 4.5}"`
      + ` fill="${hot ? '#dbeafe' : '#ffffff'}" stroke="${hot ? SELECT_COLOR : '#475569'}" stroke-width="1.5"/>`;
    if (hot) {
      const bus = BUSES[port.bus];
      s += `<text x="${pos.x}" y="${pos.y - 10}" text-anchor="middle" font-size="10" font-weight="600"`
        + ` fill="#1e40af" paint-order="stroke" stroke="#ffffff" stroke-width="3" pointer-events="none">`
        + `${esc(port.name)} · ${esc(bus ? bus.short : '')}</text>`;
    }
  }
  s += '</g>';
  return s;
}

function wireMarkup(doc, wire, selected) {
  const from = doc.nodes.find((n) => n.id === wire.from.node);
  const to = doc.nodes.find((n) => n.id === wire.to.node);
  if (!from || !to) return '';
  const pf = getPart(from.kind).ports.find((p) => p.id === wire.from.port);
  const pt = getPart(to.kind).ports.find((p) => p.id === wire.to.port);
  if (!pf || !pt) return '';
  const a = portPosition(from, pf);
  const b = portPosition(to, pt);
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const d = wirePath(a, pf.side, b, pt.side);
  const mid = wireMidpoint(a, pf.side, b, pt.side);
  const label = wire.label || bus.short;
  let s = `<g class="wire" data-id="${esc(wire.id)}" data-type="wire">`;
  s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  if (selected) {
    s += `<path d="${d}" fill="none" stroke="${SELECT_COLOR}" stroke-opacity="0.3"`
      + ` stroke-width="${bus.width + 6}" stroke-linecap="round" pointer-events="none"/>`;
  }
  s += `<path d="${d}" fill="none" stroke="${bus.color}" stroke-width="${bus.width}"`
    + `${bus.dash ? ` stroke-dasharray="${bus.dash}"` : ''} stroke-linecap="round" pointer-events="none"/>`;
  s += `<text x="${mid.x}" y="${mid.y - 6}" text-anchor="middle" font-size="10.5" font-weight="600"`
    + ` fill="${bus.color}" paint-order="stroke" stroke="#f7f7f5" stroke-width="3.5" data-edit="label">${esc(label)}</text>`;
  s += '</g>';
  return s;
}

function zoneMarkup(zone, selected) {
  const color = zone.color || '#4a90d9';
  return `<g class="zone" data-id="${esc(zone.id)}" data-type="zone">`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="${esc(color)}" fill-opacity="0.10" stroke="none" pointer-events="none"/>`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="none" stroke="${esc(color)}" stroke-width="${selected ? 2.5 : 1.5}"`
    + `${selected ? '' : ' stroke-dasharray="7 5"'}/>`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`
    + `<text x="${zone.x + 12}" y="${zone.y + 20}" font-size="12" font-weight="700"`
    + ` fill="${esc(color)}" data-edit="label">${esc(zone.label)}</text></g>`;
}

function noteMarkup(note, selected) {
  const lines = wrapText(note.text);
  const h = noteHeight(note.text);
  let s = `<g class="note" data-id="${esc(note.id)}" data-type="note">`;
  s += `<rect x="${note.x}" y="${note.y}" width="${NOTE_W}" height="${h}" rx="4"`
    + ` fill="#fef9c3" stroke="${selected ? SELECT_COLOR : '#eab308'}" stroke-width="${selected ? 2 : 1}"/>`;
  lines.forEach((line, i) => {
    s += `<text x="${note.x + 10}" y="${note.y + 20 + i * 16}" font-size="12" fill="#713f12"`
      + `${i === 0 ? ' data-edit="text"' : ''}>${esc(line)}</text>`;
  });
  s += '</g>';
  return s;
}

export function diagramMarkup(doc, ui = {}) {
  const sel = ui.selection || new Set();
  const zones = doc.zones.map((z) => zoneMarkup(z, sel.has(z.id))).join('');
  const wires = doc.wires.map((w) => wireMarkup(doc, w, sel.has(w.id))).join('');
  const nodes = doc.nodes.map((n) => nodeMarkup(n, sel.has(n.id), ui.hoverPort)).join('');
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
      + ` fill="${SELECT_COLOR}" fill-opacity="0.08" stroke="${SELECT_COLOR}" stroke-dasharray="4 3"/>`;
  }
  if (ui.wireDraft) {
    const { from, cursor } = ui.wireDraft;
    const node = doc.nodes.find((n) => n.id === from.node);
    const pd = node ? getPart(node.kind).ports.find((p) => p.id === from.port) : null;
    if (node && pd) {
      const a = portPosition(node, pd);
      s += `<path d="${wirePath(a, pd.side, cursor, oppositeSide(pd.side))}" fill="none"`
        + ` stroke="${SELECT_COLOR}" stroke-width="2" stroke-dasharray="6 4"/>`;
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
