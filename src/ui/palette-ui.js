// The parts palette: "My parts" (library templates and this board's custom
// parts) first, then the kinds placed most recently, then the catalogue by
// category. Search filters all three; tiles add on click and drag onto the
// canvas. A tile's tooltip is the guide's explanation of the part, and which
// categories are folded and what was placed recently are remembered per
// browser.
import { CATEGORIES, PARTS, getPart } from '../palette.js';
import { PART_HELP } from '../guide-parts.js';
import { partOf } from '../custom.js';
import { addNode } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { filterParts, filterTemplates } from '../search.js';
import { download } from '../export.js';
import { escAttr, toast } from './press.js';
import { badgeHTML } from './badge.js';
import { tr, trd, getLang, onLanguageChange } from '../i18n.js';

const COLLAPSED_KEY = 'schematica.palette.collapsed';
const RECENT_KEY = 'schematica.palette.recent';
const RECENT_MAX = 8;

export function initPalette({ svg, store, tools, library, editor, storage = null }) {
  const palette = document.getElementById('palette');
  const search = document.getElementById('palette-search');
  // Per-browser palette preferences; storage may be absent or blocked, and
  // a missing or malformed entry simply means the defaults.
  const remembered = (key) => {
    try { const v = JSON.parse(storage?.getItem(key) ?? 'null'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; }
    catch { return []; }
  };
  const remember = (key, list) => { try { storage?.setItem(key, JSON.stringify(list)); } catch { /* preference only */ } };
  const helpFor = (kind) => PART_HELP[kind]?.[getLang() === 'zh' ? 1 : 0] || '';

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
    if (!def) noteRecent(kind);
  }
  const fromTemplate = (t) => ({ ...t, lib: t.id });

  // ---- My parts ----
  const mine = document.createElement('div');
  mine.id = 'my-parts-group';
  // Icon buttons in the header row, drawn like the toolbar's (18-box
  // strokes): new part, import a parts file, export My parts.
  const ICON = {
    new: '<path d="M9 3.5v11 M3.5 9h11"/>',
    import: '<path d="M9 11V3 M5.5 6.5 9 3l3.5 3.5 M3 14.5h12"/>',
    export: '<path d="M9 2.5v8 M5.5 7.5 9 11l3.5-3.5 M3 14.5h12"/>',
  };
  const tool = (id, icon, label) => `<button id="${id}" type="button" title="${escAttr(label)}" aria-label="${escAttr(label)}">`
    + `<svg viewBox="0 0 18 18" aria-hidden="true">${ICON[icon]}</svg></button>`;
  const headerMarkup = () => `<h3 class="my-parts-head"><span class="my-parts-title">${escAttr(tr('My parts'))}</span><span class="my-parts-tools">`
    + tool('parts-new', 'new', tr('Define a new part'))
    + tool('parts-import', 'import', tr('Import a parts file'))
    + tool('parts-export', 'export', tr('Download My parts as a file'))
    + '</span></h3>'
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
    myHead.classList.toggle('collapsed', myCollapsed);
    // On this board sits under the same heading, so it folds with it.
    applySearch();
  });

  function relabelHeader() {
    mine.querySelector('.my-parts-title').textContent = tr('My parts');
    const b = (id, label) => { const el = mine.querySelector(`#${id}`); el.title = label; el.setAttribute('aria-label', label); };
    b('parts-new', tr('Define a new part'));
    b('parts-export', tr('Download My parts as a file'));
    b('parts-import', tr('Import a parts file'));
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

  const newPart = () => editor.open({ def: { name: '', category: 'misc', ports: [], fields: [] }, mode: 'new' });
  // An empty library shows one dashed tile that starts a new part, so the
  // section explains itself before the first part exists.
  function emptyTile() {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'palette-item new-part-tile';
    el.innerHTML = `<span class="badge"><svg viewBox="0 0 18 18" aria-hidden="true">${ICON.new}</svg></span>`
      + `<span class="pi-name">${escAttr(tr('New part'))}</span>`;
    el.addEventListener('click', newPart);
    return el;
  }

  function renderMine() {
    myGrid.innerHTML = '';
    const templates = library.list();
    for (const t of templates) myGrid.appendChild(templateTile(t));
    if (!templates.length) myGrid.appendChild(emptyTile());
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
  }, { documentOnly: true });

  mine.querySelector('#parts-new').addEventListener('click', newPart);
  mine.querySelector('#parts-export').addEventListener('click', () => {
    if (!library.list().length) { toast(tr('My parts is empty. Create or import a part first.')); return; }
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

  // A catalogue tile: badge, translated name, and the guide's explanation as
  // its tooltip. Click places at the view centre; drag places where dropped.
  function kindTile(part) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'palette-item';
    item.dataset.kind = part.kind;
    item.innerHTML = badgeHTML(part) + `<span class="pi-name">${escAttr(trd(part.name))}</span>`;
    item.title = helpFor(part.kind);
    item.draggable = true;
    item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/schematica-kind', part.kind); });
    item.addEventListener('click', () => { const c = centre(); place(part.kind, null, c.x, c.y); });
    return item;
  }
  const relabelTile = (el, part) => {
    el.querySelector('.pi-name').textContent = trd(part.name);
    el.title = helpFor(part.kind);
  };

  // ---- Recent ----
  // The kinds placed most recently, newest first, so a board that keeps
  // reaching for the same few parts does not scroll for them.
  const recentHead = document.createElement('h3');
  recentHead.id = 'palette-recent-head';
  recentHead.textContent = tr('Recent');
  const recentGrid = document.createElement('div');
  recentGrid.id = 'palette-recent';
  recentGrid.className = 'cat-grid';
  palette.appendChild(recentHead);
  palette.appendChild(recentGrid);
  let recent = remembered(RECENT_KEY).filter((k) => PARTS[k]).slice(0, RECENT_MAX);
  function renderRecent() {
    recentGrid.innerHTML = '';
    for (const kind of recent) recentGrid.appendChild(kindTile(PARTS[kind]));
    const empty = recent.length === 0;
    recentHead.hidden = empty;
    recentGrid.hidden = empty;
  }
  function noteRecent(kind) {
    if (!PARTS[kind]) return;
    recent = [kind, ...recent.filter((k) => k !== kind)].slice(0, RECENT_MAX);
    remember(RECENT_KEY, recent);
    renderRecent();
    applySearch();
  }
  renderRecent();

  // ---- Catalogue ----
  const groups = [];
  const collapsedIds = new Set(remembered(COLLAPSED_KEY));
  const saveCollapsed = () => remember(COLLAPSED_KEY, groups.filter((g) => g.collapsed).map((g) => g.cat.id));
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = trd(cat.name);
    palette.appendChild(h);
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
    const group = { h, box, cat, collapsed: collapsedIds.has(cat.id), items: [] };
    groups.push(group);
    box.hidden = group.collapsed;
    h.classList.toggle('collapsed', group.collapsed);
    h.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      box.hidden = group.collapsed;
      h.classList.toggle('collapsed', group.collapsed);
      saveCollapsed();
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = kindTile(part);
      box.appendChild(item);
      group.items.push({ el: item, kind: part.kind, part });
    }
  }

  onLanguageChange(() => {
    relabelHeader();
    recentHead.textContent = tr('Recent');
    for (const el of recentGrid.children) relabelTile(el, PARTS[el.dataset.kind]);
    for (const g of groups) {
      g.h.textContent = trd(g.cat.name);
      for (const it of g.items) relabelTile(it.el, it.part);
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
      const on = el.dataset.template ? !tHits || tHits.has(el.dataset.template) : !q;
      el.hidden = !on;
      if (on) shownMine += 1;
    }
    myHead.hidden = !!q && shownMine === 0;
    myGrid.hidden = q ? shownMine === 0 : myCollapsed;
    // A search answers from the catalogue; the Recent row would only repeat
    // its hits, so it folds away until the search clears.
    const showRecent = !q && recent.length > 0;
    recentHead.hidden = !showRecent;
    recentGrid.hidden = !showRecent;
    const onBoard = boardGrid.children.length > 0 && !q && !myCollapsed;
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
