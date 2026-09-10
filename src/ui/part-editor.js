// The custom part editor: a modal dialog that builds or edits a definition
// with a live preview of the card. Opened from the palette (+ New, or a
// template's pencil), from a custom node's properties (Edit part…), and from
// a built-in node's properties (Customize…). A save onto the board is one
// undo step; the library is updated alongside when the box is ticked.
import { CATEGORIES, PARTS } from '../palette.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import {
  LIMITS, SIDES, initials, normalizePart, draftProblems, optionList, applyDefinition, siblings, sideLabel,
} from '../custom.js';
import { addNode, findItem } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { diagramMarkup, defsMarkup } from '../render.js';
import { ACCENT_SWATCHES } from './props.js';
import { badgeHTML } from './badge.js';
import { escAttr, toast, openModal } from './press.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

export function initPartEditor({ store, library, svg, tools }) {
  const dialog = document.getElementById('part-dialog');
  const $ = (id) => document.getElementById(id);
  let draft = null; // the definition being edited, in the editor's shape
  let ctx = null;   // { nodeId, templateId, mode, name, others }
  let nextPort = 0;
  let nextField = 0;
  // The last value typed or picked on each icon tab this dialog has been
  // open for, so leaving a tab and coming back restores it instead of
  // resetting to the generic default (reset from the definition in open()).
  let lastKind = null;
  let lastText = null;
  let lastPath = null;

  function renderStatic() {
    $('pe-category').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${escAttr(trd(c.name))}</option>`).join('');
    $('pe-icon-kind').innerHTML = Object.values(PARTS).map((p) => (
      `<button type="button" data-kind="${p.kind}" title="${escAttr(trd(p.name))}">${badgeHTML(p)}</button>`
    )).join('');
    $('pe-swatches').innerHTML = ACCENT_SWATCHES.map((c) => (
      `<button type="button" class="swatch" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
    )).join('') + `<button type="button" class="swatch swatch-auto" data-swatch="" title="${escAttr(tr('Category color'))}">${escAttr(tr('Auto'))}</button>`;
  }
  renderStatic();
  // Limits come from LIMITS, not restated in the markup.
  $('pe-name').maxLength = LIMITS.name;
  $('pe-icon-text').maxLength = LIMITS.text;

  // ---- draft <-> definition ----
  // Rows keep their ids (a customized built-in keeps vcc, i2c, …); new rows
  // get p<n>/f<n> past the highest such id already present.
  function toDraft(def) {
    const top = (arr, prefix) => arr.reduce((n, x) => {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id || '');
      return m ? Math.max(n, Number(m[1])) : n;
    }, 0);
    const d = {
      lib: def.lib || null,
      name: def.name || '',
      category: CATEGORIES.some((c) => c.id === def.category) ? def.category : 'misc',
      accent: def.accent || null,
      icon: def.icon ? { ...def.icon } : { text: '' },
      ports: (def.ports || []).map((p) => ({ id: p.id, name: p.name || '', side: p.side || 'left', bus: p.bus || 'gpio', required: !!p.required })),
      // The editor has no placeholder box; the value rides along so
      // Customize… keeps a built-in field's hint.
      fields: (def.fields || []).map((f) => ({ id: f.id, label: f.label || '', options: (f.options || []).join(', '), placeholder: f.placeholder || '' })),
      // The editor has no control for feeds/passes, but they must survive a
      // round trip: customizing a regulator must not silently take it out of
      // the power budget. normalizePart drops any that name a port the user
      // has since deleted. `trio` rides along for the round trip only.
      feeds: [...(def.feeds || [])],
      passes: [...(def.passes || [])],
      trio: def.trio === true,
    };
    nextPort = top(d.ports, 'p');
    nextField = top(d.fields, 'f');
    return d;
  }
  function freshId(prefix, list, counter) {
    let n = counter;
    let id;
    do { n += 1; id = `${prefix}${n}`; } while (list.some((x) => x.id === id));
    return { id, n };
  }
  function rawDraft() {
    // An empty Initials box means "use the initials of the name" — a blank
    // name is already reported as "Name is required.", so leave it alone.
    let icon = draft.icon;
    if (icon.text !== undefined && !icon.text.trim() && draft.name.trim()) {
      icon = { text: initials(draft.name) };
    }
    return {
      ...(draft.lib ? { lib: draft.lib } : {}),
      name: draft.name,
      category: draft.category,
      accent: draft.accent,
      icon,
      ports: draft.ports.map((p) => ({ ...p })),
      fields: draft.fields.map((f) => {
        const out = { id: f.id, label: f.label };
        const options = optionList(f.options);
        if (options.length) out.options = options;
        if (f.placeholder) out.placeholder = f.placeholder;
        return out;
      }),
      ...(draft.feeds?.length ? { feeds: [...draft.feeds] } : {}),
      ...(draft.passes?.length ? { passes: [...draft.passes] } : {}),
      ...(draft.trio ? { trio: true } : {}),
    };
  }

  // ---- rows ----
  function portRow(p, i, n) {
    return `<tr data-i="${i}">`
      + `<td><input type="text" data-pname maxlength="${LIMITS.portName}" value="${escAttr(p.name)}" placeholder="${escAttr(tr('Name'))}" spellcheck="false"></td>`
      + `<td><select data-pside>${SIDES.map((s) => `<option value="${s}"${s === p.side ? ' selected' : ''}>${escAttr(sideLabel(s))}</option>`).join('')}</select></td>`
      + `<td><select data-pbus>${BUS_ORDER.map((b) => `<option value="${b}"${b === p.bus ? ' selected' : ''}>${escAttr(trd(BUSES[b].name))}</option>`).join('')}</select></td>`
      + `<td><label class="dialog-check" title="${escAttr(tr('Check reports this port when it is unwired'))}"><input type="checkbox" data-preq${p.required ? ' checked' : ''}> ${escAttr(tr('req'))}</label></td>`
      + `<td class="pe-move"><button type="button" data-up title="${escAttr(tr('Move up'))}"${i === 0 ? ' disabled' : ''}>&uarr;</button>`
      + `<button type="button" data-down title="${escAttr(tr('Move down'))}"${i === n - 1 ? ' disabled' : ''}>&darr;</button>`
      + `<button type="button" data-del title="${escAttr(tr('Remove port'))}">&times;</button></td></tr>`;
  }
  function fieldRow(f, i) {
    return `<tr data-i="${i}">`
      + `<td><input type="text" data-flabel maxlength="${LIMITS.fieldLabel}" value="${escAttr(f.label)}" placeholder="${escAttr(tr('Label'))}" spellcheck="false"></td>`
      + `<td colspan="3"><input type="text" data-fopts value="${escAttr(f.options)}" placeholder="${escAttr(tr('Choices, comma separated (blank = free text)'))}" spellcheck="false"></td>`
      + `<td class="pe-move"><button type="button" data-fdel title="${escAttr(tr('Remove field'))}">&times;</button></td></tr>`;
  }
  const renderPorts = () => { $('pe-ports').innerHTML = draft.ports.map((p, i) => portRow(p, i, draft.ports.length)).join(''); };
  const renderFields = () => { $('pe-fields').innerHTML = draft.fields.map((f, i) => fieldRow(f, i)).join(''); };
  function renderIcon() {
    const tab = draft.icon.kind !== undefined ? 'kind' : (draft.icon.path !== undefined ? 'path' : 'text');
    $('pe-icon-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('pe-icon-kind').hidden = tab !== 'kind';
    $('pe-icon-text').hidden = tab !== 'text';
    $('pe-icon-path').hidden = tab !== 'path';
    $('pe-icon-kind').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.kind === draft.icon.kind));
    $('pe-icon-text').placeholder = initials(draft.name);
    if (tab === 'text') $('pe-icon-text').value = draft.icon.text ?? '';
    if (tab === 'path') $('pe-icon-path').value = draft.icon.path ?? '';
  }
  function renderSwatches() {
    $('pe-swatches').querySelectorAll('[data-swatch]').forEach((b) => b.classList.toggle('active', (b.dataset.swatch || null) === draft.accent));
  }
  function renderAll() {
    $('pe-name').value = draft.name;
    $('pe-category').value = draft.category;
    renderSwatches();
    renderIcon();
    renderPorts();
    renderFields();
  }

  // ---- preview and validation, on every change ----
  function refresh() {
    const raw = rawDraft();
    const problems = draftProblems(raw);
    $('pe-problems').innerHTML = problems.map((p) => `<li>${escAttr(p)}</li>`).join('');
    $('pe-save').disabled = problems.length > 0;
    // The preview draws even while the name is still blank.
    const { part } = normalizePart({ ...raw, name: raw.name || tr('Part') });
    if (!part) return;
    const node = { id: 'preview', kind: 'custom', x: 0, y: 0, label: part.name, sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], part };
    const { w, h } = nodeSize(node);
    const preview = $('pe-preview');
    preview.setAttribute('viewBox', `-30 -30 ${w + 60} ${h + 60}`);
    preview.innerHTML = `<defs>${defsMarkup()}</defs>${diagramMarkup({ nodes: [node], wires: [], zones: [], notes: [] }, {})}`;
  }

  // ---- form events ----
  $('pe-name').addEventListener('input', () => {
    draft.name = $('pe-name').value;
    $('pe-icon-text').placeholder = initials(draft.name);
    refresh();
  });
  $('pe-category').addEventListener('change', () => { draft.category = $('pe-category').value; refresh(); });
  $('pe-swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-swatch]');
    if (!b) return;
    draft.accent = b.dataset.swatch || null;
    renderSwatches();
    refresh();
  });
  $('pe-icon-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const tab = b.dataset.tab;
    // Restore each tab's own last value; only an empty cache falls back to
    // a default, so a built-in icon (or typed text/path) survives a round
    // trip through the other tabs.
    if (tab === 'kind') draft.icon = { kind: lastKind || 'generic' };
    if (tab === 'text') draft.icon = { text: lastText || initials(draft.name) };
    if (tab === 'path') draft.icon = { path: lastPath || 'M4 4h8v8H4z' };
    renderIcon();
    refresh();
  });
  $('pe-icon-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    draft.icon = { kind: b.dataset.kind };
    lastKind = b.dataset.kind;
    renderIcon();
    refresh();
  });
  $('pe-icon-text').addEventListener('input', () => {
    draft.icon = { text: $('pe-icon-text').value };
    lastText = draft.icon.text;
    refresh();
  });
  $('pe-icon-path').addEventListener('input', () => {
    draft.icon = { path: $('pe-icon-path').value };
    lastPath = draft.icon.path;
    refresh();
  });

  const rowIndex = (e) => Number(e.target.closest('tr')?.dataset.i);
  $('pe-ports').addEventListener('input', (e) => {
    const p = draft.ports[rowIndex(e)];
    if (!p) return;
    if (e.target.matches('[data-pname]')) p.name = e.target.value;
    refresh();
  });
  $('pe-ports').addEventListener('change', (e) => {
    const p = draft.ports[rowIndex(e)];
    if (!p) return;
    if (e.target.matches('[data-pside]')) p.side = e.target.value;
    if (e.target.matches('[data-pbus]')) {
      p.bus = e.target.value;
      // Switching onto a supply bus marks the pin required; switching off
      // one never unticks it — that is the user's call to make.
      if (p.bus === 'power' || p.bus === 'gnd') {
        p.required = true;
        e.target.closest('tr').querySelector('[data-preq]').checked = true;
      }
    }
    if (e.target.matches('[data-preq]')) p.required = e.target.checked;
    refresh();
  });
  $('pe-ports').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = rowIndex(e);
    if (b.hasAttribute('data-del')) draft.ports.splice(i, 1);
    if (b.hasAttribute('data-up') && i > 0) [draft.ports[i - 1], draft.ports[i]] = [draft.ports[i], draft.ports[i - 1]];
    if (b.hasAttribute('data-down') && i < draft.ports.length - 1) [draft.ports[i + 1], draft.ports[i]] = [draft.ports[i], draft.ports[i + 1]];
    renderPorts();
    refresh();
  });
  $('pe-port-add').addEventListener('click', () => {
    if (draft.ports.length >= LIMITS.ports) { toast(tr('At most {max} ports.', { max: LIMITS.ports })); return; }
    const { id, n } = freshId('p', draft.ports, nextPort);
    nextPort = n;
    draft.ports.push({ id, name: '', side: 'left', bus: 'gpio', required: false });
    renderPorts();
    refresh();
    $('pe-ports').querySelector('tr:last-child [data-pname]').focus();
  });
  $('pe-fields').addEventListener('input', (e) => {
    const f = draft.fields[rowIndex(e)];
    if (!f) return;
    if (e.target.matches('[data-flabel]')) f.label = e.target.value;
    if (e.target.matches('[data-fopts]')) f.options = e.target.value;
    refresh();
  });
  $('pe-fields').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.hasAttribute('data-fdel')) return;
    draft.fields.splice(rowIndex(e), 1);
    renderFields();
    refresh();
  });
  $('pe-field-add').addEventListener('click', () => {
    if (draft.fields.length >= LIMITS.fields) { toast(tr('At most {max} fields.', { max: LIMITS.fields })); return; }
    const { id, n } = freshId('f', draft.fields, nextField);
    nextField = n;
    draft.fields.push({ id, label: '', options: '' });
    renderFields();
    refresh();
    $('pe-fields').querySelector('tr:last-child [data-flabel]').focus();
  });

  // ---- open and save ----
  function renderTitles() {
    if (!ctx) return;
    const {
      mode, nodeId, others, name,
    } = ctx;
    $('pe-title').textContent = mode === 'new' ? tr('New part') : (mode === 'customize' ? tr('Customize {name}', { name }) : tr('Edit {name}', { name }));
    const n = others.length;
    $('pe-apply-all-label').textContent = nodeId
      ? (n === 1 ? tr('Apply to the {n} other part on this board from this template', { n }) : tr('Apply to the {n} other parts on this board from this template', { n }))
      : (n === 1 ? tr('Apply to the {n} part on this board from this template', { n }) : tr('Apply to the {n} parts on this board from this template', { n }));
  }

  // def: a definition to start from. nodeId: the node being edited or
  // customized. templateId: a library template being edited from the palette.
  // Neither: a new part.
  function open({ def, nodeId = null, templateId = null, mode = 'new' }) {
    draft = toDraft(def);
    if (templateId) draft.lib = templateId;
    lastKind = draft.icon.kind ?? null;
    lastText = draft.icon.text ?? null;
    lastPath = draft.icon.path ?? null;
    const node = nodeId ? findItem(store.doc, nodeId)?.item : null;
    const others = node
      ? siblings(store.doc, node)
      : (templateId ? store.doc.nodes.filter((n) => n.kind === 'custom' && n.part?.lib === templateId) : []);
    ctx = {
      nodeId, templateId, mode, name: def.name, others: others.map((n) => n.id),
    };
    $('pe-save-lib').checked = mode === 'new' || !!templateId || !!draft.lib;
    $('pe-save-lib').disabled = mode === 'new' || !!templateId;
    $('pe-apply-all-row').hidden = !others.length;
    $('pe-apply-all').checked = true;
    renderTitles();
    renderAll();
    refresh();
    openModal(dialog);
    $('pe-name').focus();
  }

  function save() {
    const raw = rawDraft();
    if (draftProblems(raw).length) return;
    const { part } = normalizePart(raw);
    let libId = draft.lib;
    if ($('pe-save-lib').checked) {
      try { libId = library.save(part, libId); } catch (err) { toast(err.message); return; }
    }
    if (libId) part.lib = libId;
    else delete part.lib;
    const applyAll = !$('pe-apply-all-row').hidden && $('pe-apply-all').checked;
    const targets = [...(ctx.nodeId ? [ctx.nodeId] : []), ...(applyAll ? ctx.others : [])];
    if (targets.length) {
      let dropped = 0;
      store.apply((doc) => {
        for (const id of targets) dropped += applyDefinition(doc, id, structuredClone(part)).dropped;
      });
      const where = targets.length > 1 ? tr(' on {n} parts', { n: targets.length }) : '';
      const wires = dropped ? (dropped === 1 ? tr('; {n} wire dropped', { n: dropped }) : tr('; {n} wires dropped', { n: dropped })) : '';
      toast(tr('{part} updated{where}{wires}.', { part: part.name, where, wires }));
    } else if (ctx.mode === 'new') {
      // A new part goes to My parts and onto the canvas at the centre of the view.
      const r = svg.getBoundingClientRect();
      const cx = (r.width / 2 - tools.view.x) / tools.view.zoom;
      const cy = (r.height / 2 - tools.view.y) / tools.view.zoom;
      const { w, h } = nodeSize({ kind: 'custom', label: part.name, part });
      const id = addNode(store, 'custom', snap(cx - w / 2), snap(cy - h / 2), part);
      store.setSelection([id]);
      toast(tr('{part} saved to My parts.', { part: part.name }));
    } else {
      toast(tr('{part} updated in My parts.', { part: part.name }));
    }
    dialog.close();
  }

  $('pe-save').addEventListener('click', save);
  $('pe-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', (e) => { if (e.target === dialog) dialog.close(); });
  // Canvas shortcuts listen on window; a keypress inside the form is the form's.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());

  // The dialog's own markup was present at load, so the static walker's replay
  // covers it; everything rendered here is redrawn instead.
  onLanguageChange(() => {
    renderStatic();
    if (dialog.open) { renderTitles(); renderAll(); refresh(); }
  });

  return { open };
}
