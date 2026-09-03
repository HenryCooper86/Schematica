// The floating properties panel for the current selection.
import { updateItem, findItem, deleteItems, NODE_STATUSES, NODE_FLAGS } from '../state.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import { presetsFor, presetPatch } from '../presets.js';
import { onPress, escAttr, toast } from './press.js';

const STATUS_LABELS = {
  planned: 'Planned', prototype: 'Prototype', tested: 'Tested',
  production: 'Production', deprecated: 'Deprecated',
};

const FLAG_LABELS = {
  bug: 'Bug', thermal: 'Thermal', power: 'Power hungry',
  lead: 'Long lead', safety: 'Safety critical', eol: 'EOL part',
};

export const ACCENT_SWATCHES = [
  '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9',
  '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#94a3b8',
];

function propField(label, inner) {
  return `<label>${label}</label>${inner}`;
}

// Zone and swimlane color rows use the same swatch picker as net_draw
// (no "Auto" — containers always carry an explicit color).
function colorSwatchRow(current) {
  return `<label>Color</label><div class="swatches">${ACCENT_SWATCHES.map((c) => (
    `<button class="swatch${current === c ? ' active' : ''}" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
  )).join('')}</div>`;
}

function nodeFields(item) {
  let html = propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  // Vendor presets appear as suggestions under the part number; picking one
  // also fills a blank rail and notes (see presets.js).
  const presets = presetsFor(item.kind);
  html += propField('Part number', `<input type="text" data-prop="sublabel"`
    + ` placeholder="${presets.length ? 'pick a preset or type' : 'e.g. STM32F405'}"`
    + ` value="${escAttr(item.sublabel)}"${presets.length ? ' list="preset-list"' : ''}>`
    + (presets.length ? `<datalist id="preset-list">${presets.map((p) => (
      `<option value="${escAttr(p.sublabel)}">${escAttr(p.name)}</option>`
    )).join('')}</datalist>` : ''));
  html += propField('Interface address', `<input type="text" data-prop="addr" placeholder="e.g. 0x76, CAN ID 0x120" value="${escAttr(item.addr)}">`);
  html += propField('Voltage rail', `<input type="text" data-prop="rail" placeholder="e.g. 3.3V" value="${escAttr(item.rail)}">`);
  html += propField('Notes', `<textarea data-prop="notes" placeholder="Free-form notes...">${escAttr(item.notes)}</textarea>`);
  html += `<label>Lifecycle</label><div class="chips">${NODE_STATUSES.map((st) => (
    `<button class="chip${item.status === st ? ' active' : ''}" data-status="${st}">${STATUS_LABELS[st]}</button>`
  )).join('')}</div>`;
  html += `<label>Flags</label><div class="chips">${NODE_FLAGS.map((f) => (
    `<button class="chip${(item.flags || []).includes(f) ? ' active' : ''}" data-flag="${f}">${FLAG_LABELS[f]}</button>`
  )).join('')}</div>`;
  html += `<label>Accent color</label><div class="swatches">${ACCENT_SWATCHES.map((c) => (
    `<button class="swatch${item.color === c ? ' active' : ''}" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
  )).join('')}<button class="swatch swatch-auto${item.color === null ? ' active' : ''}" data-swatch="" title="Category color">Auto</button></div>`;
  html += '<button id="props-delete-one" class="danger">Delete node</button>';
  return html;
}

function wireFields(item) {
  const options = BUS_ORDER.map((b) =>
    `<option value="${b}"${b === item.bus ? ' selected' : ''}>${BUSES[b].name}</option>`).join('');
  let html = propField('Bus type', `<select data-prop="bus">${options}</select>`);
  html += propField('Label (blank = bus name)', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  const ARROWS = [[null, 'None'], ['fwd', '&rarr; To'], ['both', '&harr; Both']];
  html += `<label>Arrowheads</label><div class="chips">${ARROWS.map(([v, lab]) => (
    `<button class="chip${(item.arrow ?? null) === v ? ' active' : ''}" data-warrow="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  // Older boards may carry an explicit 'solid'; it is the same as the default.
  const STYLES = [[null, 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['sneakernet', 'Sneakernet &middot; air gap &#x1F45F;']];
  const curStyle = item.style === 'solid' ? null : (item.style ?? null);
  html += `<label>Line style</label><div class="chips">${STYLES.map(([v, lab]) => (
    `<button class="chip${curStyle === v ? ' active' : ''}" data-wstyle="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  const FLOWS = [[null, 'With Animate'], ['on', 'Always'], ['off', 'Never']];
  html += `<label>Traffic flow</label><div class="chips">${FLOWS.map(([v, lab]) => (
    `<button class="chip${(item.flow ?? null) === v ? ' active' : ''}" data-wflow="${v ?? ''}">${lab}</button>`
  )).join('')}</div>`;
  html += '<button id="props-delete-wire" class="danger">Delete wire</button>';
  return html;
}

function swimlaneFields(item) {
  let html = propField('Title', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  const ORIENTS = [['h', 'Horizontal lanes'], ['v', 'Vertical lanes']];
  html += `<label>Orientation</label><div class="chips">${ORIENTS.map(([v, lab]) => (
    `<button class="chip${(item.orient || 'h') === v ? ' active' : ''}" data-orient="${v}">${lab}</button>`
  )).join('')}</div>`;
  html += `<label>Lanes</label>${(item.lanes || []).map((lane, i) => (
    `<div class="lane-row"><input type="text" data-lane="${i}" value="${escAttr(lane)}">`
    + `<button data-lanedel="${i}" title="Remove lane">&times;</button></div>`
  )).join('')}`;
  html += '<button id="lane-add" class="lane-add">+ Add lane</button>';
  html += colorSwatchRow(item.color);
  html += '<button id="props-delete-swimlane" class="danger">Delete swimlane (keeps contents)</button>';
  return html;
}

export function createPropsPanel({ store }) {
  const props = document.getElementById('props');

  function bind(item) {
    props.querySelectorAll('[data-prop]').forEach((input) => {
      input.addEventListener('change', () => {
        const cur = findItem(store.doc, item.id)?.item;
        const patch = input.dataset.prop === 'sublabel' && cur
          ? presetPatch(cur, input.value)
          : { [input.dataset.prop]: input.value };
        updateItem(store, item.id, patch);
      });
    });
    const toggleIn = (selector, apply) => {
      props.querySelectorAll(selector).forEach((btn) => onPress(btn, () => apply(btn)));
    };
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
        lanes[Number(input.dataset.lane)] = input.value || `Lane ${Number(input.dataset.lane) + 1}`;
        updateItem(store, item.id, { lanes });
      });
    });
    toggleIn('[data-lanedel]', (btn) => {
      const cur = findItem(store.doc, item.id)?.item;
      if (!cur) return;
      if ((cur.lanes || []).length <= 1) { toast('A swimlane needs at least one lane.'); return; }
      updateItem(store, item.id, { lanes: cur.lanes.filter((_, i) => i !== Number(btn.dataset.lanedel)) });
    });
    const laneAdd = document.getElementById('lane-add');
    if (laneAdd) {
      onPress(laneAdd, () => {
        const cur = findItem(store.doc, item.id)?.item;
        if (!cur) return;
        updateItem(store, item.id, { lanes: [...(cur.lanes || []), `Lane ${(cur.lanes || []).length + 1}`] });
      });
    }
    const del = document.getElementById('props-delete-swimlane')
      || document.getElementById('props-delete-one')
      || document.getElementById('props-delete-wire');
    if (del) onPress(del, () => deleteItems(store, [item.id]));
  }

  function render() {
    if (!document.getElementById('journey-panel').hidden) {
      props.hidden = true;
      return;
    }
    const ae = document.activeElement;
    if (props.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    const ids = [...store.selection];
    if (!ids.length) {
      props.hidden = true;
      return;
    }
    props.hidden = false;
    if (ids.length > 1) {
      props.innerHTML = `<h3>${ids.length} items selected</h3><button id="props-delete" class="danger">Delete selection</button>`;
      onPress(document.getElementById('props-delete'), () => {
        deleteItems(store, [...store.selection]);
      });
      return;
    }
    const found = findItem(store.doc, ids[0]);
    if (!found) {
      props.hidden = true;
      return;
    }
    const { type, item } = found;
    let html;
    if (type === 'node') html = '<h3>Node</h3>' + nodeFields(item);
    else if (type === 'wire') html = '<h3>Wire</h3>' + wireFields(item);
    else if (type === 'zone' && item.kind === 'swimlane') html = '<h3>Swimlane</h3>' + swimlaneFields(item);
    else if (type === 'zone') {
      html = '<h3>Zone</h3>' + propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`)
        + colorSwatchRow(item.color);
    } else {
      html = '<h3>Note</h3>' + propField('Text', `<textarea data-prop="text">${escAttr(item.text)}</textarea>`);
    }
    props.innerHTML = html;
    bind(item);
  }

  return { render };
}
