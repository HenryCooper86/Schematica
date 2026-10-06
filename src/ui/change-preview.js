import { buildExportSVG, exportBounds } from '../export.js';
import { compareBoards } from '../compare.js';
import { tr } from '../i18n.js';
import { escAttr as esc } from './press.js';

const labels = () => ({ added: tr('Added'), removed: tr('Removed'), changed: tr('Changed'), rewired: tr('Rewired'), moved: tr('Layout changed') });

export function paintComparison(beforeView, afterView, before, after, changes) {
  const byId = new Map(), names = labels();
  for (const change of changes) {
    if (!byId.has(change.id)) byId.set(change.id, []);
    byId.get(change.id).push(change);
  }
  const a = exportBounds(before), b = exportBounds(after);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const bounds = [x, y, Math.max(a.x + a.w, b.x + b.w) - x, Math.max(a.y + a.h, b.y + b.h) - y].join(' ');
  for (const [pane, doc, excluded] of [[beforeView, before, 'added'], [afterView, after, 'removed']]) {
    pane.innerHTML = buildExportSVG(doc);
    const svg = pane.querySelector('svg');
    svg.setAttribute('viewBox', bounds);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', pane === beforeView ? tr('Before') : tr('After'));
    for (const el of pane.querySelectorAll('[data-id]')) {
      for (const change of byId.get(el.dataset.id) || []) if (change.type !== excluded) {
        el.classList.add(`delta-${change.type}`);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${names[change.type]}: ${change.label}`;
        el.prepend(title);
      }
    }
  }
}

export function renderChangePreview(container, before, after) {
  const { changes } = compareBoards(before, after), names = labels();
  container.innerHTML = `<h3>${esc(tr('Visual change preview'))}</h3>
    <p>${esc(tr('Read-only diagrams share the same scale. Select a change to highlight it.'))}</p>
    <p class="change-legend">${Object.entries(names).map(([type, label]) => `<span class="legend-${type}">${esc(label)}</span>`).join(' · ')}</p>
    <div class="compare-previews"><section><h4>${esc(tr('Before'))}</h4><div data-change-before></div></section><section><h4>${esc(tr('After'))}</h4><div data-change-after></div></section></div>
    <label>${esc(tr('Focus change'))}<select data-change-focus><option value="">${esc(tr('All changes'))}</option>${changes.filter(c => c.id && ['nodes','wires','notes','zones'].includes(c.collection)).map((c,i) => `<option value="${i}">${esc(names[c.type])} · ${esc(c.label)}</option>`).join('')}</select></label>`;
  const panes = [container.querySelector('[data-change-before]'), container.querySelector('[data-change-after]')];
  paintComparison(...panes, before, after, changes);
  const selectable = changes.filter(c => c.id && ['nodes','wires','notes','zones'].includes(c.collection));
  container.querySelector('[data-change-focus]').onchange = event => {
    const id = event.target.value === '' ? null : selectable[Number(event.target.value)].id;
    for (const pane of panes) for (const el of pane.querySelectorAll('[data-id]')) {
      el.classList.toggle('delta-focus', el.dataset.id === id);
      el.classList.toggle('delta-muted', !!id && el.dataset.id !== id);
    }
  };
}
