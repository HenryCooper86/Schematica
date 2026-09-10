// The floating properties panel for the current selection.
import {
  updateItem, findItem, deleteItems, setLock, nextLockState, isLocked, lockedKeptMessage,
  NODE_STATUSES, NODE_FLAGS,
} from '../state.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import { presetsFor, presetPatch } from '../presets.js';
import { DISPOSITIONS } from '../palette.js';
import { partOf, definitionFrom } from '../custom.js';
import { nodePart } from '../rdk/profiles.js';
import { onPress, escAttr, toast, keepFocus } from './press.js';
import { panelHeader, bindCollapsible } from './collapsible.js';

import { rdkDetails, targetOptions } from './rdk-details.js';
import { rdkGuide } from '../rdk/guide.js';
import { download } from '../export.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

const statusLabels = () => ({
  planned: tr('Planned'), prototype: tr('Prototype'), tested: tr('Tested'),
  production: tr('Production'), deprecated: tr('Deprecated'),
});
const flagLabels = () => ({
  bug: tr('Bug'), thermal: tr('Thermal'), power: tr('Power hungry'),
  lead: tr('Long lead'), safety: tr('Safety critical'), eol: tr('EOL part'),
});

export const ACCENT_SWATCHES = [
  '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9',
  '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#94a3b8',
];

// A field label points at its control by id, so clicking the label focuses
// the control and readers announce it. The id comes from the control's
// data-prop/data-field attribute, which is unique within one item's panel.
export function propField(label, inner) {
  const m = /\sdata-(prop|field)="([^"]*)"/.exec(inner);
  const id = m && `props-${m[1]}-${m[2].replace(/[^\w-]/g, '_')}`;
  // Only pair them when the id really landed on the leading control; a `for`
  // pointing at nothing is worse than a bare label.
  const tagged = id ? inner.replace(/^(<(?:input|textarea|select)\b)/, `$1 id="${id}"`) : inner;
  if (tagged === inner) return `<label>${escAttr(label)}</label>${inner}`;
  return `<label for="${id}">${escAttr(label)}</label>${tagged}`;
}

// The Lock row: one chip that reads as its own state, since a locked item
// keeps every other control in the panel usable. Nodes, zones, and notes have
// it; wires are never locked.
export function lockField(item) {
  const on = isLocked(item);
  return `<label>${escAttr(tr('Lock'))}</label><div class="chips">`
    + `<button class="chip${on ? ' active' : ''}" data-lock="1" aria-pressed="${on}">`
    + `${escAttr(on ? tr('Locked') : tr('Unlocked'))}</button></div>`;
}

// ---- Alignment ----
// The toolbar has no room left for eight more buttons (it already wraps on a
// narrow window), and these act on a multi-selection, which is exactly what
// this panel is for — so the group lives here, under the item count.
const ALIGN_ICONS = {
  left: '<path d="M3 2.5v13"/><rect x="5.5" y="4.5" width="9.5" height="3.4" rx="1"/><rect x="5.5" y="10.1" width="6" height="3.4" rx="1"/>',
  hcenter: '<path d="M9 2.5v13"/><rect x="4.2" y="4.5" width="9.6" height="3.4" rx="1"/><rect x="6" y="10.1" width="6" height="3.4" rx="1"/>',
  right: '<path d="M15 2.5v13"/><rect x="3" y="4.5" width="9.5" height="3.4" rx="1"/><rect x="6.5" y="10.1" width="6" height="3.4" rx="1"/>',
  top: '<path d="M2.5 3h13"/><rect x="4.5" y="5.5" width="3.4" height="9.5" rx="1"/><rect x="10.1" y="5.5" width="3.4" height="6" rx="1"/>',
  vmiddle: '<path d="M2.5 9h13"/><rect x="4.5" y="4.2" width="3.4" height="9.6" rx="1"/><rect x="10.1" y="6" width="3.4" height="6" rx="1"/>',
  bottom: '<path d="M2.5 15h13"/><rect x="4.5" y="3" width="3.4" height="9.5" rx="1"/><rect x="10.1" y="6.5" width="3.4" height="6" rx="1"/>',
  x: '<rect x="2.2" y="4" width="3.2" height="10" rx="1"/><rect x="7.4" y="4" width="3.2" height="10" rx="1"/><rect x="12.6" y="4" width="3.2" height="10" rx="1"/>',
  y: '<rect x="4" y="2.2" width="10" height="3.2" rx="1"/><rect x="4" y="7.4" width="10" height="3.2" rx="1"/><rect x="4" y="12.6" width="10" height="3.2" rx="1"/>',
};

// A number field hands back whatever was typed, so the bounds the markup
// declares are enforced here too. A blank field means "unchanged", not zero.
export function clampGap(value, fallback = 24) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(400, Math.max(0, Math.round(n)));
}

function alignButton(attr, value, label, enabled) {
  return `<button class="align-btn" data-${attr}="${value}" title="${escAttr(label)}" aria-label="${escAttr(label)}"`
    + `${enabled ? '' : ' disabled'}><svg viewBox="0 0 18 18" aria-hidden="true">${ALIGN_ICONS[value]}</svg></button>`;
}

// `ability` comes from src/align.js: what this selection can do, and whether a
// single locked item is deciding the edge. Pure, so the disabled states and
// the anchor hint can be tested without a DOM. A selection these buttons do
// not act on at all — two wires, say — gets no group rather than a grid that
// can never come alive.
export function alignGroup(ability, gap) {
  if (!ability.applies) return '';
  const align = [
    ['left', tr('Align left')], ['hcenter', tr('Align horizontal centers')], ['right', tr('Align right')],
    ['top', tr('Align top')], ['vmiddle', tr('Align vertical middles')], ['bottom', tr('Align bottom')],
  ].map(([mode, label]) => alignButton('align', mode, label, ability.canAlign)).join('');
  const spread = [
    ['x', tr('Distribute horizontally — equal gaps')], ['y', tr('Distribute vertically — equal gaps')],
  ].map(([axis, label]) => alignButton('distribute', axis, label, ability.canDistribute)).join('');
  return `<label>${escAttr(tr('Align'))}</label><div class="align-grid">${align}${spread}</div>`
    + (ability.anchored ? `<p class="align-hint">${escAttr(tr('Lined up on the locked item.'))}</p>` : '')
    + `<label for="props-tidy-gap">${escAttr(tr('Tidy spacing'))}</label><div class="tidy-row">`
    + `<input id="props-tidy-gap" type="number" min="0" max="400" step="4" value="${Number(gap)}"`
    + ` aria-label="${escAttr(tr('Gap in pixels'))}">`
    + `<button id="props-tidy" title="${escAttr(tr('Set one gap between the cards along their main axis'))}"`
    + `${ability.canTidy ? '' : ' disabled'}>${escAttr(tr('Tidy'))}</button></div>`;
}

// Zone and swimlane color rows use the same swatch picker as net_draw
// (no "Auto" — containers always carry an explicit color).
function colorSwatchRow(current) {
  return `<label>${escAttr(tr('Color'))}</label><div class="swatches">${ACCENT_SWATCHES.map((c) => (
    `<button class="swatch${current === c ? ' active' : ''}" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
  )).join('')}</div>`;
}

// Schema fields (threat parts): a select for vocabularies, free text otherwise.
// A stored value outside the vocabulary stays selectable so old boards read back.
function schemaFields(part, item, doc) {
  return part.fields.map((fd) => {
    const v = item.fields?.[fd.id] ?? '';
    if (item.kind === 'rdksoftware' && fd.id === 'target') return propField(trd(fd.label), `<select data-field="target">${targetOptions(item, doc)}</select>`);
    if (fd.options) {
      const opts = fd.options.includes(v) || !v ? fd.options : [v, ...fd.options];
      return propField(trd(fd.label), `<select data-field="${fd.id}"><option value="">&mdash;</option>${opts.map((o) => (
        `<option value="${escAttr(o)}"${o === v ? ' selected' : ''}>${escAttr(trd(o))}</option>`
      )).join('')}</select>`);
    }
    return propField(trd(fd.label), `<input type="text" data-field="${fd.id}" placeholder="${escAttr(trd(fd.placeholder || ''))}" value="${escAttr(v)}">`);
  }).join('');
}

function partNumberField(item) {
  // Vendor presets appear as suggestions under the part number; picking one
  // also fills a blank rail and notes (see presets.js).
  const presets = presetsFor(item.kind);
  return propField(tr('Part number'), `<input type="text" data-prop="sublabel"`
    + ` placeholder="${presets.length ? tr('pick a preset or type') : tr('e.g. STM32F405')}"`
    + ` value="${escAttr(item.sublabel)}"${presets.length ? ' list="preset-list"' : ''}>`
    + (presets.length ? `<datalist id="preset-list">${presets.map((p) => (
      `<option value="${escAttr(p.sublabel)}">${escAttr(p.name)}</option>`
    )).join('')}</datalist>` : ''));
}

function addrRailFields(item) {
  return propField(tr('Interface address'), `<input type="text" data-prop="addr" placeholder="${escAttr(tr('e.g. 0x76, CAN ID 0x120'))}" value="${escAttr(item.addr)}">`)
    + propField(tr('Voltage rail'), `<input type="text" data-prop="rail" placeholder="${escAttr(tr('e.g. 3.3V'))}" value="${escAttr(item.rail)}">`);
}

function nodeFields(item, doc) {
  const part = partOf(item);
  let html = propField(tr('Label'), `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  if (!part.threat) html += partNumberField(item);
  // A schema normally replaces the address/rail pair (threat and network parts
  // carry their own vocabulary instead). `trio` marks a schema that only *adds*
  // fields - current draw, say - so those parts keep the pair as well.
  if (part.custom) html += addrRailFields(item) + (part.fields ? schemaFields(part, item, doc) : '');
  else if (part.fields) html += (part.trio ? addrRailFields(item) : '') + schemaFields(part, item, doc);
  else html += addrRailFields(item);
  html += propField(tr('Notes'), `<textarea data-prop="notes" placeholder="${escAttr(tr('Free-form notes...'))}">${escAttr(item.notes)}</textarea>`);
  html += `<label>${escAttr(tr('Lifecycle'))}</label><div class="chips">${NODE_STATUSES.map((st) => (
    `<button class="chip${item.status === st ? ' active' : ''}" data-status="${st}">${statusLabels()[st]}</button>`
  )).join('')}</div>`;
  html += `<label>${escAttr(tr('Flags'))}</label><div class="chips">${NODE_FLAGS.map((f) => (
    `<button class="chip${(item.flags || []).includes(f) ? ' active' : ''}" data-flag="${f}">${flagLabels()[f]}</button>`
  )).join('')}</div>`;
  // Disposition: how this object relates to you (net_draw's vocabulary).
  html += `<label>${escAttr(tr('Disposition'))}</label><div class="chips">${Object.entries(DISPOSITIONS).map(([k, d]) => {
    const on = item.disposition === k;
    return `<button class="chip${on ? ' active' : ''}" data-disp="${k}"${on ? ` style="border-color:${d.color};color:${d.color};background:${d.color}1c"` : ''}>${trd(d.name)}</button>`;
  }).join('')}</div>`;
  html += `<label>${escAttr(tr('Accent color'))}</label><div class="swatches">${ACCENT_SWATCHES.map((c) => (
    `<button class="swatch${item.color === c ? ' active' : ''}" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
  )).join('')}<button class="swatch swatch-auto${item.color === null ? ' active' : ''}" data-swatch="" title="${escAttr(tr('Category color'))}">${escAttr(tr('Auto'))}</button></div>`;
  // Custom parts edit their definition; any other card can become one.
  if (part.custom) html += `<button id="props-edit-part" class="secondary">${escAttr(tr('Edit part…'))}</button>`;
  else if (!part.shape) html += `<button id="props-customize" class="secondary">${escAttr(tr('Customize…'))}</button>`;
  html += rdkDetails(item, doc);
  html += lockField(item);
  html += `<button id="props-delete-one" class="danger">${escAttr(tr('Delete node'))}</button>`;
  return html;
}

function wireFields(item) {
  const options = BUS_ORDER.map((b) =>
    `<option value="${b}"${b === item.bus ? ' selected' : ''}>${trd(BUSES[b].name)}</option>`).join('');
  let html = propField(tr('Bus type'), `<select data-prop="bus">${options}</select>`);
  html += propField(tr('Label (blank = bus name)'), `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  const ARROWS = [[null, tr('None')], ['fwd', tr('→ To')], ['both', tr('↔ Both')]];
  html += `<label>${escAttr(tr('Arrowheads'))}</label><div class="chips">${ARROWS.map(([v, lab]) => (
    `<button class="chip${(item.arrow ?? null) === v ? ' active' : ''}" data-warrow="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  // Older boards may carry an explicit 'solid'; it is the same as the default.
  const STYLES = [[null, tr('Solid')], ['dashed', tr('Dashed')], ['dotted', tr('Dotted')], ['sneakernet', tr('Sneakernet · air gap 👟')]];
  const curStyle = item.style === 'solid' ? null : (item.style ?? null);
  html += `<label>${escAttr(tr('Line style'))}</label><div class="chips">${STYLES.map(([v, lab]) => (
    `<button class="chip${curStyle === v ? ' active' : ''}" data-wstyle="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  const FLOWS = [[null, tr('With Animate')], ['on', tr('Always')], ['off', tr('Never')]];
  html += `<label>${escAttr(tr('Traffic flow'))}</label><div class="chips">${FLOWS.map(([v, lab]) => (
    `<button class="chip${(item.flow ?? null) === v ? ' active' : ''}" data-wflow="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  html += `<button id="props-delete-wire" class="danger">${escAttr(tr('Delete wire'))}</button>`;
  return html;
}

function swimlaneFields(item) {
  let html = propField(tr('Title'), `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  const ORIENTS = [['h', tr('Horizontal lanes')], ['v', tr('Vertical lanes')]];
  html += `<label>${escAttr(tr('Orientation'))}</label><div class="chips">${ORIENTS.map(([v, lab]) => (
    `<button class="chip${(item.orient || 'h') === v ? ' active' : ''}" data-orient="${v}">${lab}</button>`
  )).join('')}</div>`;
  html += `<label>${escAttr(tr('Lanes'))}</label>${(item.lanes || []).map((lane, i) => (
    `<div class="lane-row"><input type="text" data-lane="${i}" value="${escAttr(lane)}">`
    + `<button data-lanedel="${i}" title="${escAttr(tr('Remove lane'))}">&times;</button></div>`
  )).join('')}`;
  html += `<button id="lane-add" class="lane-add">${escAttr(tr('+ Add lane'))}</button>`;
  html += colorSwatchRow(item.color);
  html += lockField(item);
  html += `<button id="props-delete-swimlane" class="danger">${escAttr(tr('Delete swimlane (keeps contents)'))}</button>`;
  return html;
}

function reportDelete({ kept }) {
  const msg = lockedKeptMessage(kept);
  if (msg) toast(msg);
}

export function createPropsPanel({ store, editor, tools }) {
  const props = document.getElementById('props');
  // The tidy gap is a setting, not a property of the selection: it outlives
  // the panel rebuild that every selection change causes. Three grid steps.
  let tidyGap = 24;

  function bind(item) {
    const guide = props.querySelector('#rdk-guide-download');
    if (guide) onPress(guide, () => {
      const text = rdkGuide(store.doc);
      if (text) download('rdk-setup-guide.md', text, 'text/markdown;charset=utf-8');
    });
    const editPart = props.querySelector('#props-edit-part');
    if (editPart) onPress(editPart, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (cur?.part) editor.open({ def: cur.part, nodeId: cur.id, mode: 'edit' });
    });
    const customize = props.querySelector('#props-customize');
    if (customize) onPress(customize, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (cur) editor.open({ def: definitionFrom(nodePart(cur)), nodeId: cur.id, mode: 'customize' });
    });
    props.querySelectorAll('[data-prop]').forEach((input) => {
      input.addEventListener('change', () => {
        const cur = findItem(store.doc, item.id)?.item;
        const patch = input.dataset.prop === 'sublabel' && cur
          ? presetPatch(cur, input.value)
          : { [input.dataset.prop]: input.value };
        updateItem(store, item.id, patch);
      });
    });
    props.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const cur = findItem(store.doc, item.id)?.item;
        if (!cur) return;
        const fields = { ...(cur.fields || {}) };
        if (input.value.trim()) fields[input.dataset.field] = input.value.trim();
        else delete fields[input.dataset.field];
        // An empty map is dropped on load; no key keeps the doc round-trip clean.
        updateItem(store, item.id, { fields: Object.keys(fields).length ? fields : undefined });
      });
    });
    const toggleIn = (selector, apply) => {
      props.querySelectorAll(selector).forEach((btn) => onPress(btn, () => apply(btn)));
    };
    toggleIn('[data-disp]', (btn) => {
      const cur = findItem(store.doc, item.id)?.item;
      updateItem(store, item.id, { disposition: cur?.disposition === btn.dataset.disp ? null : btn.dataset.disp });
    });
    toggleIn('[data-status]', (btn) => {
      const st = btn.dataset.status;
      const cur = findItem(store.doc, item.id)?.item;
      updateItem(store, item.id, { status: cur?.status === st ? null : st });
    });
    toggleIn('[data-flag]', (btn) => {
      const f = btn.dataset.flag;
      const cur = findItem(store.doc, item.id)?.item;
      const flags = (cur?.flags || []).includes(f)
        ? cur.flags.filter((x) => x !== f)
        : [...(cur?.flags || []), f];
      updateItem(store, item.id, { flags });
    });
    toggleIn('[data-lock]', () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (cur) setLock(store, [item.id], !isLocked(cur));
    });
    toggleIn('[data-swatch]', (btn) => updateItem(store, item.id, { color: btn.dataset.swatch || null }));
    toggleIn('[data-warrow]', (btn) => updateItem(store, item.id, { arrow: btn.dataset.warrow || null }));
    toggleIn('[data-wstyle]', (btn) => updateItem(store, item.id, { style: btn.dataset.wstyle || null }));
    toggleIn('[data-wflow]', (btn) => updateItem(store, item.id, { flow: btn.dataset.wflow || null }));
    toggleIn('[data-orient]', (btn) => updateItem(store, item.id, { orient: btn.dataset.orient }));
    props.querySelectorAll('[data-lane]').forEach((input) => {
      input.addEventListener('change', () => {
        const cur = findItem(store.doc, item.id)?.item;
        if (!cur) return;
        const lanes = [...(cur.lanes || [])];
        lanes[Number(input.dataset.lane)] = input.value || tr('Lane {n}', { n: Number(input.dataset.lane) + 1 });
        updateItem(store, item.id, { lanes });
      });
    });
    toggleIn('[data-lanedel]', (btn) => {
      const cur = findItem(store.doc, item.id)?.item;
      if (!cur) return;
      if ((cur.lanes || []).length <= 1) { toast(tr('A swimlane needs at least one lane.')); return; }
      updateItem(store, item.id, { lanes: cur.lanes.filter((_, i) => i !== Number(btn.dataset.lanedel)) });
    });
    const laneAdd = document.getElementById('lane-add');
    if (laneAdd) {
      onPress(laneAdd, () => {
        const cur = findItem(store.doc, item.id)?.item;
        if (!cur) return;
        updateItem(store, item.id, { lanes: [...(cur.lanes || []), tr('Lane {n}', { n: (cur.lanes || []).length + 1 })] });
      });
    }
    const del = document.getElementById('props-delete-swimlane')
      || document.getElementById('props-delete-one')
      || document.getElementById('props-delete-wire');
    if (del) onPress(del, () => reportDelete(deleteItems(store, [item.id])));
  }

  // Each action is one undo step; tools.js measures the selection and writes
  // it. A disabled button is inert in the browser, but the guard also covers a
  // keyboard activation arriving after the selection shrank.
  function bindAlign() {
    if (!tools) return;
    const act = (selector, run) => props.querySelectorAll(selector).forEach((btn) => onPress(btn, () => {
      if (!btn.disabled) run(btn);
    }));
    act('[data-align]', (btn) => tools.alignSelection(btn.dataset.align));
    act('[data-distribute]', (btn) => tools.distributeSelection(btn.dataset.distribute));
    const gapInput = props.querySelector('#props-tidy-gap');
    if (gapInput) gapInput.addEventListener('change', () => { tidyGap = clampGap(gapInput.value); });
    const tidy = props.querySelector('#props-tidy');
    if (tidy) onPress(tidy, () => {
      if (tidy.disabled) return;
      tidyGap = clampGap(gapInput?.value);
      tools.tidySelection(tidyGap);
    });
  }

  // What the panel currently shows, as the selection it was rendered for.
  let rendered = null;

  function render() {
    if (!document.getElementById('journey-panel').hidden) {
      props.hidden = true;
      rendered = null;
      return;
    }
    const ids = [...store.selection];
    const signature = ids.join('\n');
    // A field being edited keeps its panel: a store change while it has focus
    // (Enter in an input, a select) must not rebuild the markup under it. A
    // selection change is not that case — pointerdown on the canvas fires
    // before focus leaves the field, and the panel must follow the selection.
    const ae = document.activeElement;
    const same = rendered === signature;
    if (same && props.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    // A keyboard press on a chip or button rebuilds the panel: put focus back.
    const refocus = same ? keepFocus(props) : () => {};
    if (!ids.length) {
      props.hidden = true;
      rendered = null;
      return;
    }
    props.hidden = false;
    rendered = signature;
    if (ids.length > 1) {
      // One button for the whole selection: it locks while anything in it is
      // still unlocked, and unlocks once everything is.
      const next = nextLockState(store.doc, ids);
      props.innerHTML = panelHeader(tr('{n} items selected', { n: ids.length }), 'props')
        + (tools ? alignGroup(tools.alignState(), tidyGap) : '')
        + (next === null ? '' : `<button id="props-lock" class="secondary">${escAttr(next ? tr('Lock all') : tr('Unlock all'))}</button>`)
        + `<button id="props-delete" class="danger">${escAttr(tr('Delete selection'))}</button>`;
      bindAlign();
      const lockAll = document.getElementById('props-lock');
      // Read the selection again on the press: the label is from render time.
      if (lockAll) onPress(lockAll, () => {
        const cur = [...store.selection];
        const state = nextLockState(store.doc, cur);
        if (state !== null) setLock(store, cur, state);
      });
      onPress(document.getElementById('props-delete'), () => {
        reportDelete(deleteItems(store, [...store.selection]));
      });
      bindCollapsible(props, 'props');
      refocus();
      return;
    }
    const found = findItem(store.doc, ids[0]);
    if (!found) {
      props.hidden = true;
      rendered = null;
      return;
    }
    const { type, item } = found;
    let html;
    if (type === 'node') {
      // A custom part's name is the user's own text; only catalogue names translate.
      const part = partOf(item);
      html = panelHeader(part.custom ? part.name : trd(part.name), 'props') + nodeFields(item, store.doc);
    } else if (type === 'wire') html = panelHeader(tr('Wire'), 'props') + wireFields(item);
    else if (type === 'zone' && item.kind === 'swimlane') html = panelHeader(tr('Swimlane'), 'props') + swimlaneFields(item);
    else if (type === 'zone') {
      html = panelHeader(tr('Zone'), 'props') + propField(tr('Label'), `<input type="text" data-prop="label" value="${escAttr(item.label)}">`)
        + colorSwatchRow(item.color) + lockField(item);
    } else {
      html = panelHeader(tr('Note'), 'props')
        + propField(tr('Text'), `<textarea data-prop="text">${escAttr(item.text)}</textarea>`) + lockField(item);
    }
    props.innerHTML = html;
    bind(item);
    bindCollapsible(props, 'props');
    refocus();
  }

  onLanguageChange(() => render());

  return { render };
}
