// The parts palette: category groups, search, click-to-add and drag-to-canvas.
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from '../palette.js';
import { addNode } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { filterParts } from '../search.js';

export function initPalette({ svg, store, tools }) {
  const palette = document.getElementById('palette');
  const groups = [];
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.name;
    palette.appendChild(h);
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
    const group = { h, box, collapsed: false, items: [] };
    groups.push(group);
    h.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      box.hidden = group.collapsed;
      h.classList.toggle('collapsed', group.collapsed);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      const color = part.accent || CATEGORY_COLORS[cat.id];
      const glyph = part.glyph
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"`
          + ` stroke-linejoin="round" style="color:${color}">${part.glyph}</svg>`
        : `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5"`
          + ` stroke-linecap="round" stroke-linejoin="round"><path d="${part.icon}"/></svg>`;
      item.innerHTML = `<span class="badge" style="--c:${color}">${glyph}</span>`
        + `<span class="pi-name">${part.name}</span>`;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/schematica-kind', part.kind);
      });
      item.addEventListener('click', () => {
        const r = svg.getBoundingClientRect();
        const cx = (r.width / 2 - tools.view.x) / tools.view.zoom;
        const cy = (r.height / 2 - tools.view.y) / tools.view.zoom;
        const { w, h } = nodeSize({ kind: part.kind, label: part.defaultLabel || part.name });
        const id = addNode(store, part.kind, snap(cx - w / 2), snap(cy - h / 2));
        store.setSelection([id]);
      });
      box.appendChild(item);
      group.items.push({ el: item, kind: part.kind });
    }
  }

  // Search filters parts by name, category, bus, and vendor preset names;
  // categories with no match fold away, and clearing restores the manual
  // collapsed state.
  const search = document.getElementById('palette-search');
  search.addEventListener('input', () => {
    const q = search.value.trim();
    const hits = q ? filterParts(q) : null;
    for (const g of groups) {
      let shown = 0;
      for (const { el, kind } of g.items) {
        const on = !hits || hits.has(kind);
        el.hidden = !on;
        if (on) shown += 1;
      }
      g.h.hidden = hits ? shown === 0 : false;
      g.box.hidden = hits ? shown === 0 : g.collapsed;
    }
  });

  svg.addEventListener('dragover', (e) => e.preventDefault());
  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('text/schematica-kind');
    if (!kind) return;
    const part = getPart(kind);
    const pt = tools.toWorld(e);
    const { w, h } = nodeSize({ kind: part.kind, label: part.defaultLabel || part.name });
    const id = addNode(store, kind, snap(pt.x - w / 2), snap(pt.y - h / 2));
    store.setSelection([id]);
  });
}
