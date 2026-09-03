// Boot: the store, renderer, and tools, the toolbar, autosave, and the
// animation ticker. Every panel and dialog lives in src/ui/.
import { Store, newDoc } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { serialize, deserialize } from './serialize.js';
import { decodeShare } from './share.js';
import { toast } from './ui/press.js';
import { createPropsPanel } from './ui/props.js';
import { initPalette } from './ui/palette-ui.js';
import { initLegend } from './ui/legend.js';
import { initDialogs } from './ui/dialogs.js';
import { initJourney } from './ui/journey-ui.js';
import { initExamplesMenu } from './ui/examples-menu.js';
import { initRecording } from './ui/recording-ui.js';

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
let dialogs = null;
const tools = createTools({
  svg, store, requestRender: render, onToolChange: updateToolButtons,
  onSave: () => dialogs?.saveJSON(),
});
const propsPanel = createPropsPanel({ store });

function uiState() {
  return {
    selection: store.selection,
    marquee: tools.ui.marquee,
    wireDraft: tools.ui.wireDraft,
    grid: tools.ui.grid,
    animate: tools.ui.animate,
  };
}

function updateZoomLabel() {
  document.getElementById('zoom-label').textContent = `${Math.round(tools.view.zoom * 100)}%`;
}

// kind: 'all' rebuilds the diagram; 'view' only moves the camera (pan, zoom,
// journey tweens); 'overlay' only redraws transient drag feedback. Hover is
// pure CSS and flow animation runs in CSS, so neither ever rebuilds the SVG.
function render(kind = 'all') {
  if (kind === 'view') {
    renderer.setView(tools.view, tools.ui.grid);
    updateZoomLabel();
    return;
  }
  if (kind === 'overlay') {
    renderer.renderOverlay(store.doc, uiState());
    return;
  }
  renderer.render(store.doc, tools.view, uiState());
  updateZoomLabel();
  document.getElementById('undo').disabled = !store.canUndo();
  document.getElementById('redo').disabled = !store.canRedo();
  document.getElementById('btn-remove').disabled = store.selection.size === 0;
  propsPanel.render();
}

store.subscribe(() => render());

// ---- Animation ticker ----
// Flow dashes and pulses animate in CSS; only the air-gap footprints need a
// JS step, so the ticker (~30fps) runs just while a sneakernet wire flows.
let animRaf = null;
let lastAnimFrame = 0;

function needsTicker() {
  return store.doc.wires.some((w) => w.style === 'sneakernet'
    && (w.flow === 'on' || (w.flow !== 'off' && tools.ui.animate)));
}

function animTick(now) {
  if (!needsTicker()) {
    animRaf = null;
    return;
  }
  if (now - lastAnimFrame >= 33) {
    lastAnimFrame = now;
    renderer.step(now);
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

// ---- Autosave ----
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

// ---- Panels, dialogs, menus ----
initPalette({ svg, store, tools });
initLegend();
dialogs = initDialogs({ store });
const recorder = initRecording({ svg, store });
initJourney({ svg, store, tools, render, recorder, propsPanel });
initExamplesMenu({ store });

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
