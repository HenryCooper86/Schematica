import { Store, newDoc, addNode, updateItem, findItem, deleteItems } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from './palette.js';
import { snap } from './geometry.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { serialize, deserialize } from './serialize.js';
import { buildExportSVG, exportPNG, download } from './export.js';
import { addStep, updateStep, removeStep, moveStep, tweenView } from './journey.js';

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
const tools = createTools({ svg, store, requestRender: render, onToolChange: updateToolButtons });

function render() {
  renderer.render(store.doc, tools.view, {
    selection: store.selection,
    marquee: tools.ui.marquee,
    wireDraft: tools.ui.wireDraft,
    hoverPort: tools.ui.hoverPort,
    grid: tools.ui.grid,
  });
  document.getElementById('zoom-label').textContent = `${Math.round(tools.view.zoom * 100)}%`;
  document.getElementById('undo').disabled = !store.canUndo();
  document.getElementById('redo').disabled = !store.canRedo();
  renderProps();
}

store.subscribe(render);

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
document.getElementById('btn-grid').addEventListener('click', (e) => {
  tools.ui.grid = !tools.ui.grid;
  e.currentTarget.classList.toggle('active', tools.ui.grid);
  render();
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

function renderProps() {
  if (!document.getElementById('journey-panel').hidden) {
    props.hidden = true;
    return;
  }
  if (props.contains(document.activeElement)) return;
  const ids = [...store.selection];
  if (!ids.length) {
    props.hidden = true;
    return;
  }
  props.hidden = false;
  if (ids.length > 1) {
    props.innerHTML = `<h3>${ids.length} items selected</h3><button id="props-delete">Delete selection</button>`;
    document.getElementById('props-delete').addEventListener('click', () => {
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
  const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = `<h3>${type[0].toUpperCase()}${type.slice(1)}</h3>`;
  if (type === 'node') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Part number', `<input type="text" data-prop="sublabel" value="${escAttr(item.sublabel)}">`);
    html += propField('Accent color', `<input type="color" data-prop="color" value="${escAttr(item.color || '#38bdf8')}">`);
  } else if (type === 'wire') {
    const options = BUS_ORDER.map((b) =>
      `<option value="${b}"${b === item.bus ? ' selected' : ''}>${BUSES[b].name}</option>`).join('');
    html += propField('Bus type', `<select data-prop="bus">${options}</select>`);
    html += propField('Label (blank = bus name)', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
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
}

function safeName(ext) {
  return `${(store.doc.title || 'schematica').replace(/[^\w-]+/g, '_')}${ext}`;
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm('Clear the board? Anything not saved to a file is lost.')) {
    store.replaceDoc(newDoc());
  }
});

document.getElementById('btn-save').addEventListener('click', () => {
  download(safeName('.schematica.json'), serialize(store.doc), 'application/json');
});

document.getElementById('btn-export-svg').addEventListener('click', () => {
  download(safeName('.svg'), buildExportSVG(store.doc), 'image/svg+xml');
});

document.getElementById('btn-export-png').addEventListener('click', () => {
  exportPNG(buildExportSVG(store.doc), (blob) => {
    if (blob) download(safeName('.png'), blob);
    else alert('PNG export failed in this browser. The SVG export still works.');
  });
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
    if (warnings.length) alert(`Opened with warnings:\n\n${warnings.join('\n')}`);
  } catch (err) {
    alert(err.message);
  }
});

// ---- Legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '<h3>Buses</h3>' + BUS_ORDER.map((id) => {
    const b = BUSES[id];
    const dash = b.dash ? ` stroke-dasharray="${b.dash}"` : '';
    return `<div class="legend-row"><svg width="36" height="10">`
      + `<line x1="2" y1="5" x2="34" y2="5" stroke="${b.color}" stroke-width="${Math.min(b.width, 4)}"${dash} stroke-linecap="round"/>`
      + `</svg><span>${b.name}</span></div>`;
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

function currentView() {
  return { x: tools.view.x, y: tools.view.y, zoom: tools.view.zoom };
}

function flyTo(target, instant = false) {
  if (tweenRaf) cancelAnimationFrame(tweenRaf);
  if (instant) {
    tools.view.x = target.x;
    tools.view.y = target.y;
    tools.view.zoom = target.zoom;
    render();
    return;
  }
  const from = currentView();
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
  const escA = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
  document.getElementById('journey-add').addEventListener('click', () => {
    addStep(store, currentView());
  });
  document.getElementById('journey-present').addEventListener('click', presentEnter);
  journeyPanel.querySelectorAll('[data-jfield]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.closest('.journey-step').dataset.step;
      updateStep(store, id, { [input.dataset.jfield]: input.value });
    });
  });
  journeyPanel.querySelectorAll('[data-jact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.journey-step').dataset.step;
      const act = btn.dataset.jact;
      const step = (store.doc.journey || []).find((s) => s.id === id);
      if (!step) return;
      if (act === 'go') flyTo(step.view);
      if (act === 'set') updateStep(store, id, { view: currentView() });
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
  const step = steps[presentState.index];
  if (!step) { presentExit(); return; }
  presentState.caption = step.caption || '';
  presentState.counter = `${presentState.index + 1} / ${steps.length}`;
  document.getElementById('present-caption').textContent = presentState.caption;
  document.getElementById('present-counter').textContent = presentState.counter;
  flyTo(step.view);
}

function presentGo(delta) {
  const steps = store.doc.journey || [];
  const next = presentState.index + delta;
  if (next < 0 || next >= steps.length) return;
  presentState.index = next;
  presentShow();
}

function presentKeys(e) {
  if (!presentState.active) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); presentGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); presentGo(-1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); presentExit(); }
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
}

document.getElementById('present-prev').addEventListener('click', () => presentGo(-1));
document.getElementById('present-next').addEventListener('click', () => presentGo(1));
document.getElementById('present-exit').addEventListener('click', presentExit);

render();
