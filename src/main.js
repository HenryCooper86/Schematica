import { Store, newDoc, addNode } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { CATEGORIES, PARTS, getPart } from './palette.js';
import { snap } from './geometry.js';

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

buildPalette();
render();
