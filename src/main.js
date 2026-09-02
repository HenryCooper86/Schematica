import {
  Store, newDoc, addNode, updateItem, findItem, deleteItems, NODE_STATUSES, NODE_FLAGS,
} from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from './palette.js';
import { snap } from './geometry.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { serialize, deserialize } from './serialize.js';
import { buildExportSVG, exportBounds, exportPNG, exportPDF, download } from './export.js';
import { encodeGIF } from './gif.js';
import { LOOP_MS } from './render.js';
import { buildBOM, bomCSV, bomMarkdown } from './bom.js';
import { checkDoc } from './drc.js';
import { encodeShare, decodeShare } from './share.js';
import { esc } from './render.js';
import { addStep, updateStep, removeStep, moveStep, tweenView } from './journey.js';
import { createRecorder } from './recorder.js';
import { EXAMPLES } from './examples.js';

const svg = document.getElementById('canvas');

function loadAutosave() {
  try {
    const text = localStorage.getItem('schematica.autosave');
    if (!text) return null;
    return deserialize(text).doc;
  } catch (err) {
    console.warn('Discarding unreadable autosave:', err);
    return null;
  }
}

const store = new Store(loadAutosave() || newDoc());
const renderer = createRenderer(svg);
const tools = createTools({
  svg, store, requestRender: render, onToolChange: updateToolButtons,
  onSave: () => saveJSON(),
});

// Non-blocking notice in the corner of the canvas, in place of alert().
let toastTimer = null;
function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

function renderCanvas(now = performance.now()) {
  renderer.render(store.doc, tools.view, {
    selection: store.selection,
    marquee: tools.ui.marquee,
    wireDraft: tools.ui.wireDraft,
    hoverPort: tools.ui.hoverPort,
    hoverNode: tools.ui.hoverNode,
    tool: tools.getTool(),
    grid: tools.ui.grid,
    animate: tools.ui.animate,
    now,
  });
}

function render() {
  renderCanvas();
  document.getElementById('zoom-label').textContent = `${Math.round(tools.view.zoom * 100)}%`;
  document.getElementById('undo').disabled = !store.canUndo();
  document.getElementById('redo').disabled = !store.canRedo();
  document.getElementById('btn-remove').disabled = store.selection.size === 0;
  renderProps();
}

store.subscribe(render);

// ---- Animation ticker ----
// Attribute-driven so recordings capture the motion; ~30fps, runs only while enabled.
let animRaf = null;
let lastAnimFrame = 0;

// The ticker runs while the global toggle is on, or while any wire opts into
// "Always" traffic flow — that per-wire override animates on its own.
function needsTicker() {
  return tools.ui.animate || store.doc.wires.some((w) => w.flow === 'on');
}

function animTick(now) {
  if (!needsTicker()) {
    animRaf = null;
    return;
  }
  if (now - lastAnimFrame >= 33) {
    lastAnimFrame = now;
    renderCanvas(now);
  }
  animRaf = requestAnimationFrame(animTick);
}

function syncAnimation() {
  document.getElementById('btn-animate').classList.toggle('active', tools.ui.animate);
  if (needsTicker() && !animRaf) animRaf = requestAnimationFrame(animTick);
}

store.subscribe(syncAnimation);

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  tools.ui.animate = false;
}

document.getElementById('btn-animate').addEventListener('click', () => {
  tools.ui.animate = !tools.ui.animate;
  syncAnimation();
  render();
});

// ---- Fullscreen ----
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  const request = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  request?.catch?.(() => { /* denied by the browser; nothing to do */ });
});

let autosaveTimer = null;
store.subscribe(() => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem('schematica.autosave', serialize(store.doc));
    } catch (err) {
      console.warn('Autosave failed:', err);
    }
  }, 300);
});

// ---- Toolbar ----
function updateToolButtons(tool) {
  for (const btn of document.querySelectorAll('#toolbar .tool')) {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  }
}

for (const btn of document.querySelectorAll('#toolbar .tool')) {
  btn.addEventListener('click', () => tools.setTool(btn.dataset.tool));
}

document.getElementById('undo').addEventListener('click', () => store.undo());
document.getElementById('redo').addEventListener('click', () => store.redo());
document.getElementById('zoom-in').addEventListener('click', () => tools.zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => tools.zoomBy(1 / 1.2));
document.getElementById('zoom-reset').addEventListener('click', () => tools.zoomReset());
document.getElementById('btn-fit').addEventListener('click', () => tools.zoomFit());
document.getElementById('btn-grid').addEventListener('click', (e) => {
  tools.ui.grid = !tools.ui.grid;
  e.currentTarget.classList.toggle('active', tools.ui.grid);
  render();
});
document.getElementById('btn-snap').addEventListener('click', (e) => {
  tools.ui.snapOn = !tools.ui.snapOn;
  e.currentTarget.classList.toggle('active', tools.ui.snapOn);
});

const titleInput = document.getElementById('title');
titleInput.value = store.doc.title;
titleInput.addEventListener('change', () => {
  store.apply((doc) => {
    doc.title = titleInput.value.trim() || 'Untitled Board';
  });
  titleInput.value = store.doc.title;
});
store.subscribe(() => {
  if (document.activeElement !== titleInput) titleInput.value = store.doc.title;
});

// ---- Palette ----
function buildPalette() {
  const palette = document.getElementById('palette');
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.name;
    palette.appendChild(h);
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
    h.addEventListener('click', () => {
      box.hidden = !box.hidden;
      h.classList.toggle('collapsed', box.hidden);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      const color = CATEGORY_COLORS[cat.id];
      item.innerHTML = `<span class="badge" style="--c:${color}">`
        + `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5"`
        + ` stroke-linecap="round" stroke-linejoin="round"><path d="${part.icon}"/></svg></span>`
        + `<span class="pi-name">${part.name}</span>`;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/schematica-kind', part.kind);
      });
      item.addEventListener('click', () => {
        const r = svg.getBoundingClientRect();
        const cx = (r.width / 2 - tools.view.x) / tools.view.zoom;
        const cy = (r.height / 2 - tools.view.y) / tools.view.zoom;
        const id = addNode(store, part.kind, snap(cx - part.w / 2), snap(cy - part.h / 2));
        store.setSelection([id]);
      });
      box.appendChild(item);
    }
  }
}

svg.addEventListener('dragover', (e) => e.preventDefault());
svg.addEventListener('drop', (e) => {
  e.preventDefault();
  const kind = e.dataTransfer.getData('text/schematica-kind');
  if (!kind) return;
  const part = getPart(kind);
  const pt = tools.toWorld(e);
  const id = addNode(store, kind, snap(pt.x - part.w / 2), snap(pt.y - part.h / 2));
  store.setSelection([id]);
});

// ---- Properties panel ----
const props = document.getElementById('props');

function propField(label, inner) {
  return `<label>${label}</label>${inner}`;
}

// Panel buttons act on pointerdown. A plain click handler loses the first
// click after editing a field: the blur commits, the store emits, and the
// panel rebuild replaces the button between mousedown and mouseup, so the
// click never lands. Pointerdown fires before the blur; any pending edit is
// committed explicitly first so ordering matches the old click path. The
// click listener stays for keyboard activation, suppressed after a pointer
// press so the same activation can't fire twice.
function onPress(btn, fn) {
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const ae = document.activeElement;
    if (ae && ae !== btn && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
    btn._pointerFired = true;
    window.addEventListener('pointerup', () => {
      setTimeout(() => { btn._pointerFired = false; }, 0);
    }, { once: true });
    fn(e);
  });
  btn.addEventListener('click', (e) => {
    if (!btn._pointerFired) fn(e);
  });
}

const STATUS_LABELS = {
  planned: 'Planned', prototype: 'Prototype', tested: 'Tested',
  production: 'Production', deprecated: 'Deprecated',
};

const FLAG_LABELS = {
  bug: 'Bug', thermal: 'Thermal', power: 'Power hungry',
  lead: 'Long lead', safety: 'Safety critical', eol: 'EOL part',
};

const ACCENT_SWATCHES = [
  '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9',
  '#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#94a3b8',
];

function renderProps() {
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
  const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = `<h3>${type[0].toUpperCase()}${type.slice(1)}</h3>`;
  if (type === 'node') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Part number', `<input type="text" data-prop="sublabel" placeholder="e.g. STM32F405" value="${escAttr(item.sublabel)}">`);
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
  } else if (type === 'wire') {
    const options = BUS_ORDER.map((b) =>
      `<option value="${b}"${b === item.bus ? ' selected' : ''}>${BUSES[b].name}</option>`).join('');
    html += propField('Bus type', `<select data-prop="bus">${options}</select>`);
    html += propField('Label (blank = bus name)', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    const ARROWS = [[null, 'None'], ['fwd', '&rarr; To'], ['both', '&harr; Both']];
    html += `<label>Arrowheads</label><div class="chips">${ARROWS.map(([v, lab]) => (
      `<button class="chip${(item.arrow ?? null) === v ? ' active' : ''}" data-warrow="${v ?? ''}">${lab}</button>`
    )).join('')}</div>`;
    const STYLES = [[null, 'Bus default'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['sneakernet', 'Sneakernet &middot; air gap &#x1F45F;']];
    html += `<label>Line style</label><div class="chips">${STYLES.map(([v, lab]) => (
      `<button class="chip${(item.style ?? null) === v ? ' active' : ''}" data-wstyle="${v ?? ''}">${lab}</button>`
    )).join('')}</div>`;
    const FLOWS = [[null, 'With Animate'], ['on', 'Always'], ['off', 'Never']];
    html += `<label>Traffic flow</label><div class="chips">${FLOWS.map(([v, lab]) => (
      `<button class="chip${(item.flow ?? null) === v ? ' active' : ''}" data-wflow="${v ?? ''}">${lab}</button>`
    )).join('')}</div>`;
    html += '<button id="props-delete-wire" class="danger">Delete wire</button>';
  } else if (type === 'zone' && item.kind === 'swimlane') {
    html = '<h3>Swimlane</h3>';
    html += propField('Title', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    const ORIENTS = [['h', 'Horizontal lanes'], ['v', 'Vertical lanes']];
    html += `<label>Orientation</label><div class="chips">${ORIENTS.map(([v, lab]) => (
      `<button class="chip${(item.orient || 'h') === v ? ' active' : ''}" data-orient="${v}">${lab}</button>`
    )).join('')}</div>`;
    html += `<label>Lanes</label>${(item.lanes || []).map((lane, i) => (
      `<div class="lane-row"><input type="text" data-lane="${i}" value="${escAttr(lane)}">`
      + `<button data-lanedel="${i}" title="Remove lane">&times;</button></div>`
    )).join('')}`;
    html += '<button id="lane-add" class="lane-add">+ Add lane</button>';
    html += propField('Color', `<input type="color" data-prop="color" value="${escAttr(item.color)}">`);
    html += '<button id="props-delete-swimlane" class="danger">Delete swimlane (keeps contents)</button>';
  } else if (type === 'zone') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Color', `<input type="color" data-prop="color" value="${escAttr(item.color)}">`);
  } else if (type === 'note') {
    html += propField('Text', `<textarea data-prop="text">${escAttr(item.text)}</textarea>`);
  }
  props.innerHTML = html;
  props.querySelectorAll('[data-prop]').forEach((input) => {
    input.addEventListener('change', () => {
      updateItem(store, item.id, { [input.dataset.prop]: input.value });
    });
  });
  props.querySelectorAll('[data-status]').forEach((btn) => {
    onPress(btn, () => {
      const st = btn.dataset.status;
      const cur = findItem(store.doc, item.id)?.item;
      updateItem(store, item.id, { status: cur?.status === st ? null : st });
    });
  });
  props.querySelectorAll('[data-flag]').forEach((btn) => {
    onPress(btn, () => {
      const f = btn.dataset.flag;
      const cur = findItem(store.doc, item.id)?.item;
      const flags = (cur?.flags || []).includes(f)
        ? cur.flags.filter((x) => x !== f)
        : [...(cur?.flags || []), f];
      updateItem(store, item.id, { flags });
    });
  });
  props.querySelectorAll('[data-swatch]').forEach((btn) => {
    onPress(btn, () => {
      updateItem(store, item.id, { color: btn.dataset.swatch || null });
    });
  });
  props.querySelectorAll('[data-warrow]').forEach((btn) => {
    onPress(btn, () => {
      updateItem(store, item.id, { arrow: btn.dataset.warrow || null });
    });
  });
  props.querySelectorAll('[data-wstyle]').forEach((btn) => {
    onPress(btn, () => {
      updateItem(store, item.id, { style: btn.dataset.wstyle || null });
    });
  });
  props.querySelectorAll('[data-wflow]').forEach((btn) => {
    onPress(btn, () => {
      updateItem(store, item.id, { flow: btn.dataset.wflow || null });
    });
  });
  props.querySelectorAll('[data-orient]').forEach((btn) => {
    onPress(btn, () => {
      updateItem(store, item.id, { orient: btn.dataset.orient });
    });
  });
  props.querySelectorAll('[data-lane]').forEach((input) => {
    input.addEventListener('change', () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (!cur) return;
      const lanes = [...(cur.lanes || [])];
      lanes[Number(input.dataset.lane)] = input.value || `Lane ${Number(input.dataset.lane) + 1}`;
      updateItem(store, item.id, { lanes });
    });
  });
  props.querySelectorAll('[data-lanedel]').forEach((btn) => {
    onPress(btn, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (!cur) return;
      if ((cur.lanes || []).length <= 1) { toast('A swimlane needs at least one lane.'); return; }
      const lanes = cur.lanes.filter((_, i) => i !== Number(btn.dataset.lanedel));
      updateItem(store, item.id, { lanes });
    });
  });
  const laneAdd = document.getElementById('lane-add');
  if (laneAdd) {
    onPress(laneAdd, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (!cur) return;
      updateItem(store, item.id, { lanes: [...(cur.lanes || []), `Lane ${(cur.lanes || []).length + 1}`] });
    });
  }
  const delSwim = document.getElementById('props-delete-swimlane');
  if (delSwim) {
    onPress(delSwim, () => {
      deleteItems(store, [item.id]);
    });
  }
  const delOne = document.getElementById('props-delete-one') || document.getElementById('props-delete-wire');
  if (delOne) {
    onPress(delOne, () => {
      deleteItems(store, [item.id]);
    });
  }
}


function safeName(ext) {
  return `${(store.doc.title || 'schematica').replace(/[^\w-]+/g, '_')}${ext}`;
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm('Clear the board? Anything not saved to a file is lost.')) {
    store.replaceDoc(newDoc());
  }
});

function saveJSON() {
  download(safeName('.schematica.json'), serialize(store.doc), 'application/json');
}

document.getElementById('btn-save').addEventListener('click', saveJSON);

document.getElementById('btn-export-svg').addEventListener('click', () => {
  download(safeName('.svg'), buildExportSVG(store.doc), 'image/svg+xml');
});

// ---- Export dialog ----
const exportDialog = document.getElementById('export-dialog');
const exportW = document.getElementById('export-w');
const exportH = document.getElementById('export-h');
let exportAspect = 1;

document.getElementById('btn-export-png').addEventListener('click', () => {
  const b = exportBounds(store.doc);
  exportAspect = b.w / b.h;
  exportW.value = Math.round(b.w * 2);
  exportH.value = Math.round(b.h * 2);
  exportDialog.hidden = false;
});

exportW.addEventListener('input', () => {
  if (document.getElementById('export-lock').checked) {
    exportH.value = Math.max(16, Math.round(Number(exportW.value) / exportAspect) || 16);
  }
});
exportH.addEventListener('input', () => {
  if (document.getElementById('export-lock').checked) {
    exportW.value = Math.max(16, Math.round(Number(exportH.value) * exportAspect) || 16);
  }
});

function exportOpts() {
  return { transparent: document.getElementById('export-transparent').checked };
}

document.getElementById('export-png-go').addEventListener('click', () => {
  const clampPx = (v) => Math.min(16384, Math.max(16, Math.round(Number(v)) || 16));
  const width = clampPx(exportW.value);
  const height = clampPx(exportH.value);
  exportDialog.hidden = true;
  exportPNG(buildExportSVG(store.doc, exportOpts()), (blob) => {
    if (blob) download(safeName('.png'), blob);
    else toast('PNG export failed in this browser. The SVG export still works.');
  }, { width, height });
});

document.getElementById('export-svg-go').addEventListener('click', () => {
  exportDialog.hidden = true;
  download(safeName('.svg'), buildExportSVG(store.doc, exportOpts()), 'image/svg+xml');
});

document.getElementById('export-pdf-go').addEventListener('click', () => {
  const width = Math.min(16384, Math.max(16, Math.round(Number(exportW.value)) || 16));
  exportDialog.hidden = true;
  exportPDF(buildExportSVG(store.doc), (blob) => {
    if (blob) download(safeName('.pdf'), blob);
    else toast('PDF export failed in this browser. PNG and SVG still work.');
  }, { width });
});

// A seamless loop: LOOP_MS returns every animated attribute to its start, so
// the last frame leads perfectly back into the first.
let loopBusy = false;
document.getElementById('export-gifloop-go').addEventListener('click', async () => {
  if (loopBusy) return;
  loopBusy = true;
  exportDialog.hidden = true;
  toast('Rendering the seamless loop GIF…');
  try {
    const b = exportBounds(store.doc);
    let width = Math.min(960, Math.max(16, Math.round(Number(exportW.value)) || 960));
    let height = Math.max(16, Math.round(width * (b.h / b.w)));
    if (height > 960) {
      // Tall boards get the same cap as wide ones — 60 retained frames add up.
      width = Math.max(16, Math.round(width * (960 / height)));
      height = 960;
    }
    const FRAMES = 60;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      const svgStr = buildExportSVG(store.doc, { now: (i * LOOP_MS) / FRAMES });
      const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        ctx.drawImage(img, 0, 0, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
      frames.push({ data: ctx.getImageData(0, 0, width, height).data, width, height });
    }
    const bytes = encodeGIF(frames, { delayMs: LOOP_MS / FRAMES });
    download(safeName('.loop.gif'), new Blob([bytes], { type: 'image/gif' }), 'image/gif');
    toast('Seamless loop GIF saved.');
  } catch {
    toast('Loop GIF export failed in this browser.');
  } finally {
    loopBusy = false;
  }
});

document.getElementById('export-cancel').addEventListener('click', () => {
  exportDialog.hidden = true;
});
exportDialog.addEventListener('pointerdown', (e) => {
  if (e.target === exportDialog) exportDialog.hidden = true;
});

// ---- BOM dialog ----
const bomDialog = document.getElementById('bom-dialog');

document.getElementById('btn-bom').addEventListener('click', () => {
  const bomRows = buildBOM(store.doc);
  const body = bomRows.map((r) => (
    `<tr><td>${esc(r.part)}</td><td>${esc(r.sublabel)}</td><td>${r.qty}</td>`
    + `<td class="wrap">${esc(r.refs.join(', '))}</td><td>${esc(r.addrs.join(', '))}</td>`
    + `<td>${esc(r.rails.join(', '))}</td><td>${esc(r.statuses.join(', '))}</td>`
    + `<td>${esc(r.flags.join(', '))}</td><td class="wrap">${esc(r.notes.join('; '))}</td></tr>`
  )).join('');
  document.getElementById('bom-table').innerHTML = bomRows.length
    ? '<table><thead><tr><th>Part</th><th>Part number</th><th>Qty</th><th>Refs</th>'
      + '<th>Addresses</th><th>Rails</th><th>Status</th><th>Flags</th><th>Notes</th></tr></thead>'
      + `<tbody>${body}</tbody></table>`
    : '<p style="padding:12px">The board is empty - add some parts first.</p>';
  bomDialog.hidden = false;
});

// Rows are re-derived at click time so exports always match the live board,
// even if it was edited (e.g. via undo) while the dialog was open.
document.getElementById('bom-csv').addEventListener('click', () => {
  download(safeName('.bom.csv'), bomCSV(buildBOM(store.doc)), 'text/csv');
});
document.getElementById('bom-md').addEventListener('click', () => {
  navigator.clipboard.writeText(bomMarkdown(buildBOM(store.doc)))
    .then(() => toast('Markdown table copied to clipboard.'))
    .catch(() => toast('Could not access the clipboard - use Download CSV instead.'));
});
document.getElementById('bom-close').addEventListener('click', () => {
  bomDialog.hidden = true;
});
bomDialog.addEventListener('pointerdown', (e) => {
  if (e.target === bomDialog) bomDialog.hidden = true;
});

// ---- Delete selection (toolbar) ----
document.getElementById('btn-remove').addEventListener('click', () => {
  deleteItems(store, [...store.selection]);
});

// ---- Design rule check ----
const drcDialog = document.getElementById('drc-dialog');

document.getElementById('btn-check').addEventListener('click', () => {
  const findings = checkDoc(store.doc);
  const list = document.getElementById('drc-list');
  if (!findings.length) {
    list.innerHTML = '<p class="drc-clean">No issues found - the board passes every check.</p>';
  } else {
    list.innerHTML = findings.map((f, i) => (
      `<div class="drc-row"><span class="drc-level ${f.level}">${f.level.toUpperCase()}</span>`
      + `<span class="msg">${esc(f.message)}</span>`
      + `<button data-drc="${i}">Select</button></div>`
    )).join('');
    list.querySelectorAll('[data-drc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setSelection(findings[Number(btn.dataset.drc)].ids);
        drcDialog.hidden = true;
      });
    });
  }
  drcDialog.hidden = false;
});

document.getElementById('drc-close').addEventListener('click', () => {
  drcDialog.hidden = true;
});
drcDialog.addEventListener('pointerdown', (e) => {
  if (e.target === drcDialog) drcDialog.hidden = true;
});

// ---- Share link ----
document.getElementById('btn-share').addEventListener('click', async () => {
  try {
    const fragment = await encodeShare(store.doc);
    const url = `${location.origin}${location.pathname}#${fragment}`;
    await navigator.clipboard.writeText(url);
    toast(`Share link copied to clipboard (${url.length.toLocaleString()} characters).`);
  } catch (err) {
    toast('Could not copy the share link - your browser blocked clipboard access.');
  }
});

const fileInput = document.getElementById('file-input');
document.getElementById('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const { doc, warnings } = deserialize(await file.text());
    store.replaceDoc(doc);
    if (warnings.length) toast(`Opened with warnings:\n\n${warnings.join('\n')}`);
  } catch (err) {
    toast(err.message);
  }
});

// ---- Legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '<h3>Buses</h3>' + BUS_ORDER.map((id) => {
    const b = BUSES[id];
    const dash = b.dash ? ` stroke-dasharray="${esc(b.dash)}"` : '';
    return `<div class="legend-row"><svg width="36" height="10">`
      + `<line x1="2" y1="5" x2="34" y2="5" stroke="${esc(b.color)}" stroke-width="${Math.min(b.width, 4)}"${dash} stroke-linecap="round"/>`
      + `</svg><span>${esc(b.name)}</span></div>`;
  }).join('');
}

document.getElementById('btn-legend').addEventListener('click', (e) => {
  const legend = document.getElementById('legend');
  legend.hidden = !legend.hidden;
  e.currentTarget.classList.toggle('active', !legend.hidden);
});

buildLegend();

buildPalette();

// ---- Journey ----
const journeyPanel = document.getElementById('journey-panel');
const presentState = { active: false, index: 0, caption: '', counter: '' };
let tweenRaf = null;

// Journey steps store world-space centers so they frame the same content on any
// viewport — including present mode, where hiding the chrome resizes the canvas.
function currentCenter() {
  const r = svg.getBoundingClientRect();
  const { zoom } = tools.view;
  return {
    cx: (r.width / 2 - tools.view.x) / zoom,
    cy: (r.height / 2 - tools.view.y) / zoom,
    zoom,
  };
}

function centerToView(c) {
  const r = svg.getBoundingClientRect();
  return {
    x: r.width / 2 - c.cx * c.zoom,
    y: r.height / 2 - c.cy * c.zoom,
    zoom: c.zoom,
  };
}

function flyToCenter(c, instant = false) {
  flyTo(centerToView(c), instant);
}

function flyTo(target, instant = false) {
  if (tweenRaf) cancelAnimationFrame(tweenRaf);
  // Jump instead of tweening when frames won't run (hidden tab) or the user
  // asked for reduced motion — otherwise the camera would silently never move.
  if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    instant = true;
  }
  if (instant) {
    tools.view.x = target.x;
    tools.view.y = target.y;
    tools.view.zoom = target.zoom;
    render();
    return;
  }
  const from = { x: tools.view.x, y: tools.view.y, zoom: tools.view.zoom };
  const t0 = performance.now();
  const dur = 600;
  const tick = (now) => {
    const v = tweenView(from, target, (now - t0) / dur);
    tools.view.x = v.x;
    tools.view.y = v.y;
    tools.view.zoom = v.zoom;
    render();
    if (now - t0 < dur) tweenRaf = requestAnimationFrame(tick);
    else tweenRaf = null;
  };
  tweenRaf = requestAnimationFrame(tick);
}

function renderJourney() {
  if (journeyPanel.hidden) return;
  const ae = document.activeElement;
  if (journeyPanel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  const steps = store.doc.journey || [];
  const escA = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '<h3>Journey</h3>';
  steps.forEach((s, i) => {
    html += `<div class="journey-step" data-step="${escA(s.id)}">`
      + `<div class="step-head"><span class="step-num">${i + 1}</span>`
      + `<input type="text" data-jfield="label" value="${escA(s.label)}"></div>`
      + `<textarea data-jfield="caption" placeholder="Caption shown while presenting">${escA(s.caption)}</textarea>`
      + '<div class="step-actions">'
      + '<button data-jact="go">Go</button>'
      + '<button data-jact="set" title="Update this step to the current view">Set</button>'
      + '<button data-jact="up">&uarr;</button>'
      + '<button data-jact="down">&darr;</button>'
      + '<button data-jact="del">&times;</button>'
      + '</div></div>';
  });
  html += '<div class="journey-actions">'
    + '<button id="journey-add">+ Add step from current view</button>'
    + `<button id="journey-present"${steps.length ? '' : ' disabled'}>&#9654; Present</button>`
    + '</div>';
  journeyPanel.innerHTML = html;
  onPress(document.getElementById('journey-add'), () => {
    addStep(store, currentCenter());
  });
  onPress(document.getElementById('journey-present'), presentEnter);
  journeyPanel.querySelectorAll('[data-jfield]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.closest('.journey-step').dataset.step;
      updateStep(store, id, { [input.dataset.jfield]: input.value });
    });
  });
  journeyPanel.querySelectorAll('[data-jact]').forEach((btn) => {
    onPress(btn, () => {
      const id = btn.closest('.journey-step').dataset.step;
      const act = btn.dataset.jact;
      const step = (store.doc.journey || []).find((s) => s.id === id);
      if (!step) return;
      if (act === 'go') flyToCenter(step.view);
      if (act === 'set') updateStep(store, id, { view: currentCenter() });
      if (act === 'up') moveStep(store, id, -1);
      if (act === 'down') moveStep(store, id, 1);
      if (act === 'del') removeStep(store, id);
    });
  });
}

document.getElementById('btn-journey').addEventListener('click', (e) => {
  journeyPanel.hidden = !journeyPanel.hidden;
  e.currentTarget.classList.toggle('active', !journeyPanel.hidden);
  renderJourney();
  renderProps();
});

store.subscribe(renderJourney);

// ---- Present mode ----
const overlay = document.getElementById('present-overlay');

function presentShow() {
  const steps = store.doc.journey || [];
  if (!steps.length) { presentExit(); return; }
  presentedJourney = JSON.stringify(steps);
  presentState.index = Math.min(presentState.index, steps.length - 1);
  const step = steps[presentState.index];
  presentState.caption = step.caption || '';
  presentState.counter = `${presentState.index + 1} / ${steps.length}`;
  document.getElementById('present-caption').textContent = presentState.caption;
  document.getElementById('present-counter').textContent = presentState.counter;
  flyToCenter(step.view);
  recorder.setOverlay(presentState.caption, presentState.counter);
}

function presentGo(delta) {
  const steps = store.doc.journey || [];
  const next = presentState.index + delta;
  if (next < 0 || next >= steps.length) return;
  presentState.index = next;
  presentShow();
}

function presentKeys(e) {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (!presentState.active) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); presentGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); presentGo(-1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); presentExit(); }
  else if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
    // Tool switches and F (fit) would silently move the presented camera.
    // Modifier shortcuts (undo/redo) stay live — presenting re-syncs to them.
    e.stopPropagation();
  }
}

function presentEnter() {
  if (!(store.doc.journey || []).length) return;
  presentState.active = true;
  presentState.index = 0;
  document.getElementById('app').classList.add('presenting');
  overlay.hidden = false;
  window.addEventListener('keydown', presentKeys, true);
  presentShow();
}

function presentExit() {
  if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = null; }
  presentState.active = false;
  presentState.caption = '';
  presentState.counter = '';
  document.getElementById('app').classList.remove('presenting');
  overlay.hidden = true;
  window.removeEventListener('keydown', presentKeys, true);
  recorder.setOverlay('', '');
}

document.getElementById('present-prev').addEventListener('click', () => presentGo(-1));
document.getElementById('present-next').addEventListener('click', () => presentGo(1));
document.getElementById('present-exit').addEventListener('click', presentExit);

// While presenting, an undo/redo or edit can change or remove the current
// step; re-show so the caption, counter, and camera stay truthful (and don't
// stay baked into recorded frames).
let presentedJourney = '';
store.subscribe(() => {
  if (!presentState.active) return;
  const j = JSON.stringify(store.doc.journey || []);
  if (j !== presentedJourney) presentShow();
});

// ---- Examples ----
const examplesMenu = document.getElementById('examples-menu');
const examplesBtn = document.getElementById('btn-examples');

let examplesDismiss = null;

function closeExamplesMenu() {
  examplesMenu.hidden = true;
  examplesMenu.innerHTML = '';
  if (examplesDismiss) {
    window.removeEventListener('pointerdown', examplesDismiss);
    examplesDismiss = null;
  }
}

examplesBtn.addEventListener('click', () => {
  if (!examplesMenu.hidden) {
    closeExamplesMenu();
    return;
  }
  examplesMenu.innerHTML = EXAMPLES.map((ex) => (
    `<button data-example="${ex.id}">${ex.name}</button>`
  )).join('');
  const r = examplesBtn.getBoundingClientRect();
  examplesMenu.style.left = `${Math.min(r.left, window.innerWidth - 230)}px`;
  examplesMenu.style.top = `${r.bottom + 6}px`;
  examplesMenu.hidden = false;
  examplesMenu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ex = EXAMPLES.find((e2) => e2.id === btn.dataset.example);
      closeExamplesMenu();
      if (!ex) return;
      if (!confirm(`Load "${ex.name}"? Anything not saved to a file is lost.`)) return;
      const { doc, warnings } = deserialize(serialize(ex.doc));
      store.replaceDoc(doc);
      if (warnings.length) toast(`Example loaded with warnings:\n\n${warnings.join('\n')}`);
    });
  });
  setTimeout(() => {
    examplesDismiss = (ev) => {
      if (!examplesMenu.contains(ev.target) && ev.target !== examplesBtn) {
        closeExamplesMenu();
      }
    };
    window.addEventListener('pointerdown', examplesDismiss);
  }, 0);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !examplesMenu.hidden) closeExamplesMenu();
});

// ---- Recording ----
const recorder = createRecorder(svg, { notify: toast });
const recDialog = document.getElementById('rec-dialog');
const recBtn = document.getElementById('btn-rec');

function recRenderFormats() {
  const formats = [...recorder.videoFormats(), { id: 'gif', label: 'GIF (animated)', ext: 'gif' }];
  document.getElementById('rec-formats').innerHTML = formats.map((f, i) => (
    `<label><input type="radio" name="rec-format" value="${f.id}"${i === 0 ? ' checked' : ''}> ${f.label}</label>`
  )).join('');
  document.querySelectorAll('input[name="rec-format"]').forEach((r) => {
    r.addEventListener('change', () => {
      document.getElementById('rec-audio').classList.toggle('disabled', r.value === 'gif' && r.checked);
    });
  });
}

function recOnState(s) {
  if (s.encoding) {
    recBtn.textContent = 'Encoding…';
    recBtn.disabled = true;
    recBtn.classList.remove('recording');
    return;
  }
  recBtn.disabled = false;
  if (s.recording) {
    const m = Math.floor(s.elapsed / 60);
    const sec = String(s.elapsed % 60).padStart(2, '0');
    recBtn.innerHTML = `<span class="rec-dot"></span>${m}:${sec} Stop`;
    recBtn.classList.add('recording');
  } else {
    recBtn.innerHTML = '<span class="rec-dot"></span>Rec';
    recBtn.classList.remove('recording');
  }
}

let recStoppedAt = 0;
recBtn.addEventListener('click', () => {
  if (recorder.state().recording) {
    recorder.stop();
    recStoppedAt = performance.now();
    return;
  }
  if (recorder.state().encoding) return;
  // A double-click on Stop must not bounce straight into the record dialog.
  if (performance.now() - recStoppedAt < 500) return;
  recRenderFormats();
  document.getElementById('rec-audio').classList.remove('disabled');
  recDialog.hidden = false;
});

document.getElementById('rec-cancel').addEventListener('click', () => {
  recDialog.hidden = true;
});
recDialog.addEventListener('pointerdown', (e) => {
  if (e.target === recDialog) recDialog.hidden = true;
});

document.getElementById('btn-export-gif').addEventListener('click', () => {
  if (recorder.state().recording || recorder.state().encoding) {
    toast('Finish the current recording first.');
    return;
  }
  recRenderFormats();
  recDialog.hidden = false;
  const gifRadio = document.querySelector('input[name="rec-format"][value="gif"]');
  gifRadio.checked = true;
  document.getElementById('rec-audio').classList.add('disabled');
});

document.getElementById('rec-start').addEventListener('click', async () => {
  const format = document.querySelector('input[name="rec-format"]:checked')?.value;
  if (!format) return;
  const audio = document.querySelector('input[name="rec-audio"]:checked')?.value || 'none';
  const musicFile = document.getElementById('rec-music').files[0] || null;
  if (format !== 'gif' && audio === 'music' && !musicFile) {
    toast('Choose a music file first, or pick a different audio option.');
    return;
  }
  try {
    await recorder.start({
      format,
      audio: format === 'gif' ? 'none' : audio,
      musicFile,
      basename: (store.doc.title || 'schematica').replace(/[^\w-]+/g, '_'),
      onState: recOnState,
    });
    recDialog.hidden = true;
  } catch (err) {
    toast(err.message);
  }
});

render();
syncAnimation();

// A share link in the URL loads the shared board — but never silently over the
// visitor's own work: a non-empty board asks first, and the previous autosave
// is kept under a backup key either way.
(async () => {
  if (!location.hash || location.hash.length < 4) return;
  try {
    const text = await decodeShare(location.hash);
    const { doc, warnings } = deserialize(text);
    const cur = store.doc;
    const hasWork = cur.nodes.length || cur.wires.length || cur.zones.length
      || cur.notes.length || (cur.journey || []).length;
    if (hasWork && !confirm(`Load the shared board "${doc.title}"?\n\nYour current board will be replaced. A backup of it is kept in this browser.`)) {
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    try {
      const prev = localStorage.getItem('schematica.autosave');
      if (prev) localStorage.setItem('schematica.autosave.backup', prev);
    } catch { /* backup is best-effort */ }
    history.replaceState(null, '', location.pathname + location.search);
    store.replaceDoc(doc);
    if (warnings.length) toast(`Shared board loaded with warnings:\n\n${warnings.join('\n')}`);
  } catch {
    // Not a share link (or a corrupted one) - leave the current board alone.
  }
})();
