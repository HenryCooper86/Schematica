// The parts palette: "My parts" (library templates and this board's custom
// parts) first, then the catalogue by category. Search filters both;
// tiles add on click and drag onto the canvas.
import { CATEGORIES, PARTS, getPart } from '../palette.js';
import { partOf } from '../custom.js';
import { addNode } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { filterParts, filterTemplates } from '../search.js';
import { download } from '../export.js';
import { escAttr, toast } from './press.js';
import { badgeHTML } from './badge.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

export function initPalette({ svg, store, tools, library, editor }) {
  const palette = document.getElementById('palette');
  const search = document.getElementById('palette-search');

  const centre = () => {
    const r = svg.getBoundingClientRect();
    return { x: (r.width / 2 - tools.view.x) / tools.view.zoom, y: (r.height / 2 - tools.view.y) / tools.view.zoom };
  };
  // Places a catalogue kind, or a custom definition when `def` is given, with
  // its centre at (x, y), and selects it.
  function place(kind, def, x, y) {
    const probe = def ? { kind: 'custom', label: def.name, part: def } : { kind, label: trd(getPart(kind).defaultLabel || getPart(kind).name) };
    const { w, h } = nodeSize(probe);
    const id = addNode(store, def ? 'custom' : kind, snap(x - w / 2), snap(y - h / 2), def);
    store.setSelection([id]);
  }
  const fromTemplate = (t) => ({ ...t, lib: t.id });

  // ---- My parts ----
  const mine = document.createElement('div');
  mine.id = 'my-parts-group';
  const headerMarkup = () => `<h3 class="my-parts-head"><span>${escAttr(tr('My parts'))}</span><span class="my-parts-tools">`
    + `<button id="parts-new" type="button" title="${escAttr(tr('Define a new part'))}">${escAttr(tr('+ New'))}</button>`
    + `<button id="parts-export" type="button" title="${escAttr(tr('Download My parts as a file'))}">${escAttr(tr('Export'))}</button>`
    + `<button id="parts-import" type="button" title="${escAttr(tr('Import a parts file'))}">${escAttr(tr('Import'))}</button></span></h3>`
    + '<div class="cat-grid" id="my-parts"></div>'
    + `<h3 id="board-parts-head" class="sub" hidden>${escAttr(tr('On this board'))}</h3><div class="cat-grid" id="board-parts" hidden></div>`;
  mine.innerHTML = headerMarkup();
  palette.appendChild(mine);
  const myHead = mine.querySelector('.my-parts-head');
  const myGrid = mine.querySelector('#my-parts');
  const boardHead = mine.querySelector('#board-parts-head');
  const boardGrid = mine.querySelector('#board-parts');
  let myCollapsed = false;
  myHead.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    myCollapsed = !myCollapsed;
    myGrid.hidden = myCollapsed;
    myHead.classList.toggle('collapsed', myCollapsed);
  });

  function relabelHeader() {
    mine.querySelector('.my-parts-head > span').textContent = tr('My parts');
    const b = (id, text, title) => { const el = mine.querySelector(`#${id}`); el.textContent = text; el.title = title; };
    b('parts-new', tr('+ New'), tr('Define a new part'));
    b('parts-export', tr('Export'), tr('Download My parts as a file'));
    b('parts-import', tr('Import'), tr('Import a parts file'));
    mine.querySelector('#board-parts-head').textContent = tr('On this board');
  }

  function templateTile(t) {
    const el = document.createElement('div');
    el.className = 'palette-item custom-item';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.template = t.id;
    el.draggable = true;
    el.innerHTML = badgeHTML(partOf({ kind: 'custom', part: t })) + `<span class="pi-name">${escAttr(t.name)}</span>`
      + `<span class="pi-tools"><button type="button" data-edit title="${escAttr(tr('Edit part'))}">&#9998;</button>`
      + `<button type="button" data-del title="${escAttr(tr('Remove from My parts'))}">&times;</button></span>`;
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/schematica-template', t.id); });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) { editor.open({ def: t, templateId: t.id, mode: 'edit' }); return; }
      if (e.target.closest('[data-del]')) {
        const gone = library.remove(t.id);
        if (gone) toast(tr('Removed {part} from My parts.', { part: gone.name }), { action: { label: tr('Undo'), run: () => library.save(gone, gone.id) } });
        return;
      }
      const c = centre();
      place('custom', fromTemplate(t), c.x, c.y);
    });
    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      const c = centre();
      place('custom', fromTemplate(t), c.x, c.y);
    });
    return el;
  }

  // Custom parts on the board whose template is not in the library (or that
  // never had one), one tile per template or name, so a board from someone
  // else can seed My parts.
  function boardParts() {
    const have = new Set(library.list().map((t) => t.id));
    const seen = new Map();
    for (const n of store.doc.nodes) {
      if (n.kind !== 'custom' || !n.part) continue;
      if (n.part.lib && have.has(n.part.lib)) continue;
      const key = n.part.lib || `name:${n.part.name}`;
      if (!seen.has(key)) seen.set(key, n);
    }
    return [...seen.values()];
  }
  function boardTile(n) {
    const el = document.createElement('div');
    el.className = 'palette-item custom-item';
    el.innerHTML = badgeHTML(partOf(n)) + `<span class="pi-name">${escAttr(n.part.name)}</span>`
      + `<button type="button" class="pi-adopt" data-adopt>${escAttr(tr('Add to library'))}</button>`;
    el.querySelector('[data-adopt]').addEventListener('click', () => {
      // Resolve the node fresh at click time: the tile was built from a
      // render that may be stale (a share link swapped the board, or an
      // undo/Edit part minted a new definition, without a re-render in
      // between), so a closed-over `n` could save the wrong definition.
      const fresh = store.doc.nodes.find((m) => m.id === n.id);
      if (!fresh || !fresh.part) return;
      let id;
      try { id = library.save(fresh.part, fresh.part.lib || null); } catch (err) { toast(err.message); return; }
      if (!fresh.part.lib) {
        // Every one-off of this name now belongs to the new template.
        const name = fresh.part.name;
        store.apply((doc) => {
          for (const m of doc.nodes) {
            if (m.kind === 'custom' && m.part && !m.part.lib && m.part.name === name) m.part = { lib: id, ...m.part };
          }
        });
      }
      toast(tr('{part} added to My parts.', { part: fresh.part.name }));
    });
    return el;
  }

  function renderMine() {
    myGrid.innerHTML = '';
    for (const t of library.list()) myGrid.appendChild(templateTile(t));
    boardGrid.innerHTML = '';
    for (const n of boardParts()) boardGrid.appendChild(boardTile(n));
    applySearch();
  }
  library.subscribe(renderMine);
  // Re-render when the set of custom nodes' `part` objects changes identity,
  // not when a derived key (lib id + name) matches: two different boards can
  // share the same orphan lib id and name (a share link swapping in a node
  // with the same missing template but a different port count, or an undo
  // that restores an older definition), and a key match would then skip the
  // re-render and leave a stale tile whose Add to library saves the wrong
  // definition. Undo, load, and Edit part all mint fresh `part` objects;
  // dragging a node does not, so a plain drag causes no extra render.
  let prevParts = [];
  store.subscribe(() => {
    const parts = store.doc.nodes.filter((n) => n.kind === 'custom' && n.part).map((n) => n.part);
    const changed = parts.length !== prevParts.length || parts.some((p, i) => p !== prevParts[i]);
    if (!changed) return;
    prevParts = parts;
    renderMine();
  });

  mine.querySelector('#parts-new').addEventListener('click', () => {
    editor.open({ def: { name: '', category: 'misc', ports: [], fields: [] }, mode: 'new' });
  });
  mine.querySelector('#parts-export').addEventListener('click', () => {
    download('my-parts.schematica-parts.json', library.exportJSON(), 'application/json');
  });
  const fileInput = document.getElementById('parts-file-input');
  mine.querySelector('#parts-import').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const res = library.importJSON(await file.text());
      const n = res.added + res.replaced;
      let msg = n === 1
        ? tr('Imported {added} new and {replaced} updated part.', { added: res.added, replaced: res.replaced })
        : tr('Imported {added} new and {replaced} updated parts.', { added: res.added, replaced: res.replaced });
      const k = res.warnings.length;
      if (k) msg += ' ' + (k === 1 ? tr('{n} entry skipped or adjusted.', { n: k }) : tr('{n} entries skipped or adjusted.', { n: k }));
      toast(msg);
    } catch (err) {
      toast(err.message);
    }
  });

  // ---- Catalogue ----
  const groups = [];
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = trd(cat.name);
    palette.appendChild(h);
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
    const group = { h, box, cat, collapsed: false, items: [] };
    groups.push(group);
    h.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      box.hidden = group.collapsed;
      h.classList.toggle('collapsed', group.collapsed);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      item.dataset.kind = part.kind;
      item.innerHTML = badgeHTML(part) + `<span class="pi-name">${escAttr(trd(part.name))}</span>`;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/schematica-kind', part.kind); });
      item.addEventListener('click', () => { const c = centre(); place(part.kind, null, c.x, c.y); });
      box.appendChild(item);
      group.items.push({ el: item, kind: part.kind, part });
    }
  }

  onLanguageChange(() => {
    relabelHeader();
    for (const g of groups) {
      g.h.textContent = trd(g.cat.name);
      for (const it of g.items) it.el.querySelector('.pi-name').textContent = trd(it.part.name);
    }
    renderMine();
  });

  // ---- Search ----
  // Categories with no match fold away; clearing restores the manual
  // collapsed state. The My parts heading hides when nothing of its matches,
  // so a search shows only the headings that have tiles under them.
  function applySearch() {
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
    const tHits = q ? new Set(filterTemplates(q, library.list()).map((t) => t.id)) : null;
    let shownMine = 0;
    for (const el of myGrid.children) {
      const on = !tHits || tHits.has(el.dataset.template);
      el.hidden = !on;
      if (on) shownMine += 1;
    }
    myHead.hidden = !!q && shownMine === 0;
    myGrid.hidden = q ? shownMine === 0 : myCollapsed;
    const onBoard = boardGrid.children.length > 0 && !q;
    boardHead.hidden = !onBoard;
    boardGrid.hidden = !onBoard;
  }
  search.addEventListener('input', applySearch);
  renderMine();

  // ---- Drop onto the canvas ----
  svg.addEventListener('dragover', (e) => e.preventDefault());
  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    const pt = tools.toWorld(e);
    const tid = e.dataTransfer.getData('text/schematica-template');
    if (tid) {
      const t = library.get(tid);
      if (t) place('custom', fromTemplate(t), pt.x, pt.y);
      return;
    }
    const kind = e.dataTransfer.getData('text/schematica-kind');
    if (kind) place(kind, null, pt.x, pt.y);
  });
}
