import { searchBoard, connectionFocus } from '../explore.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import { nodeSize } from '../geometry.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

export function initExplore({ store, tools, svg, render }) {
  const panel = document.getElementById('explore-panel');
  const button = document.getElementById('btn-explore');
  const query = document.getElementById('board-search');
  const bus = document.getElementById('explore-bus');
  const connections = document.getElementById('explore-connections');
  const depth = document.getElementById('explore-depth');
  const results = document.getElementById('explore-results');
  const status = document.getElementById('explore-status');
  const summary = document.getElementById('explore-summary');
  let generation = store.generation;

  function state() {
    if (generation !== store.generation) {
      generation = store.generation;
      query.value = ''; bus.value = ''; connections.value = 'all';
    }
    return { bus: bus.value, connections: connections.value, depth: depth.value };
  }

  function open(show) {
    panel.hidden = !show;
    button.setAttribute('aria-expanded', String(show));
    button.classList.toggle('active', show);
    if (show) { refresh(); query.focus(); }
  }

  function focusNode(id) {
    const node = store.doc.nodes.find((n) => n.id === id);
    if (!node) return;
    tools.ui.story = null;
    store.setSelection([id]);
    const { w, h } = nodeSize(node);
    const canvas = svg.getBoundingClientRect();
    // Use the space between this panel and the visible right-hand panels.
    const left = panel.getBoundingClientRect().right - canvas.left + 20;
    let right = canvas.width - 20;
    for (const name of ['props', 'journey-panel', 'assistant']) {
      const el = document.getElementById(name);
      const r = el.getBoundingClientRect();
      if (!el.hidden && r.width && r.height) right = Math.min(right, r.left - canvas.left - 20);
    }
    const hasRoom = right - left >= Math.max(w, 180);
    if (!hasRoom) open(false);
    const cx = hasRoom ? (left + right) / 2 : (right > w ? right / 2 : canvas.width / 2);
    tools.view.zoom = Math.min(1.5, Math.max(1, tools.view.zoom));
    tools.view.x = cx - (node.x + w / 2) * tools.view.zoom;
    tools.view.y = canvas.height / 2 - (node.y + h / 2) * tools.view.zoom;
    render('view');
    svg.focus();
  }

  function refresh() {
    const current = state();
    const filtered = current.bus || current.connections !== 'all' || current.depth !== 'full';
    button.classList.toggle('filtered', !!filtered);
    const focus = connectionFocus(store.doc, current, store.selection);
    summary.textContent = current.connections !== 'all' && !focus.tracing
      ? tr('Select a part to explore its connections.')
      : focus.active
        ? tr('Parts: {nodes} · Connections: {wires}', { nodes: focus.nodes.size, wires: focus.wires.size })
        : tr('Select a part or filter by bus to explore connections.');
    if (panel.hidden) return;
    const hits = searchBoard(store.doc, query.value);
    status.textContent = hits.length === 1 ? tr('1 part found') : hits.length ? tr('{n} parts found', { n: hits.length }) : tr('No matching parts.');
    results.replaceChildren();
    for (const node of hits.slice(0, 50)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.nodeId = node.id;
      const label = document.createElement('span');
      label.textContent = node.label;
      const meta = document.createElement('small');
      meta.textContent = [node.sublabel, node.addr, node.rail].filter(Boolean).join(' · ') || node.id;
      item.append(label, meta);
      item.addEventListener('click', () => focusNode(node.id));
      results.append(item);
    }
    if (hits.length > 50) status.textContent += ' ' + tr('Showing the first 50; refine your search.');
  }

  function translate() {
    const selectedBus = bus.value;
    bus.replaceChildren(new Option(tr('All buses'), ''));
    for (const id of BUS_ORDER) bus.add(new Option(`${BUSES[id].short} — ${trd(BUSES[id].name)}`, id));
    bus.value = selectedBus;
    refresh();
  }
  button.addEventListener('click', () => open(panel.hidden));
  document.getElementById('explore-close').addEventListener('click', () => { open(false); button.focus(); });
  document.getElementById('explore-reset').addEventListener('click', () => {
    tools.ui.story = null;
    query.value = ''; bus.value = ''; connections.value = 'all'; depth.value = 'full';
    refresh(); render();
  });
  query.addEventListener('input', refresh);
  query.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { results.querySelector('button')?.click(); e.preventDefault(); }
    if (e.key === 'ArrowDown') { results.querySelector('button')?.focus(); e.preventDefault(); }
  });
  for (const el of [bus, connections, depth]) el.addEventListener('change', () => { tools.ui.story = null; refresh(); render(); });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { open(false); button.focus(); }
    // Editor shortcuts must not act on the board while using this panel.
    e.stopPropagation();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"], dialog')
      || document.querySelector('dialog[open]') || document.getElementById('app').classList.contains('presenting')) return;
    e.preventDefault(); open(true);
  });
  store.subscribe(() => { if (!store.isDragging()) refresh(); });
  onLanguageChange(translate);
  translate();
  return { state };
}
