import { Store, newDoc, addNode, updateItem, findItem, deleteItems } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { CATEGORIES, PARTS, getPart } from './palette.js';
import { snap } from './geometry.js';
import { BUSES, BUS_ORDER } from './buses.js';

const svg = document.getElementById('canvas');
const store = new Store(newDoc());
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

// ---- Palette ----
function buildPalette() {
  const palette = document.getElementById('palette');
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.name;
    palette.appendChild(h);
    const box = document.createElement('div');
    palette.appendChild(box);
    h.addEventListener('click', () => {
      box.hidden = !box.hidden;
      h.classList.toggle('collapsed', box.hidden);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      item.textContent = part.name;
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
  const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = `<h3>${type[0].toUpperCase()}${type.slice(1)}</h3>`;
  if (type === 'node') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Part number', `<input type="text" data-prop="sublabel" value="${escAttr(item.sublabel)}">`);
    html += propField('Fill color', `<input type="color" data-prop="color" value="${escAttr(item.color || '#ffffff')}">`);
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

buildPalette();
render();
