import { initAppearance } from './ui/theme-ui.js';
import { initCompare } from './ui/compare-ui.js';
// Boot: the store, renderer, and tools, the toolbar, autosave, and the
// animation ticker. Every panel and dialog lives in src/ui/.
import { Store, newDoc } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { serialize, deserialize } from './serialize.js';
import { decodeShare } from './share.js';
import { toast } from './ui/press.js';
import { createLibrary } from './library.js';
import { createPropsPanel } from './ui/props.js';
import { initPartEditor } from './ui/part-editor.js';
import { initPalette } from './ui/palette-ui.js';
import { initExplore } from './ui/explore-ui.js';
import { initLegend } from './ui/legend.js';
import { initDialogs } from './ui/dialogs.js';
import { initJourney } from './ui/journey-ui.js';
import { initExamplesMenu } from './ui/examples-menu.js';
import { initRecording } from './ui/recording-ui.js';
import { initLayoutToggles } from './ui/panels.js';
import { initShortcuts } from './ui/shortcuts-ui.js';
import { initAssistant } from './ui/assistant-ui.js';
import { initI18n, onLanguageChange, tr } from './i18n.js';
import { translateStatic, initLanguageSwitch } from './ui/i18n-dom.js';

const svg = document.getElementById('canvas');

// Bind the language before anything renders; storage may be blocked.
let langStorage = null;
try { langStorage = window.localStorage; } catch { langStorage = null; }
initI18n({ storage: langStorage });
translateStatic();
initAppearance(langStorage);

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
let explorer = null;
// The part library lives in localStorage; reading `window.localStorage`
// throws when site data is blocked, so it takes null and lives in memory.
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const library = createLibrary(storage);
// tools reads the library to recognise a pasted custom card's template.
const tools = createTools({
  svg, store, requestRender: render, onToolChange: updateToolButtons,
  onSave: () => dialogs?.saveJSON(), library,
});
const editor = initPartEditor({ store, library, svg, tools });
// tools measures the selection for the panel's align controls.
const propsPanel = createPropsPanel({ store, editor, tools });

function uiState() {
  return {
    selection: store.selection,
    marquee: tools.ui.marquee,
    wireDraft: tools.ui.wireDraft,
    grid: tools.ui.grid,
    animate: tools.ui.animate,
    highlight: tools.ui.highlight,
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
    renderer.setReadingDepth(tools.ui.presenting ? 'full' : explorer?.state().depth, tools.view.zoom);
    updateZoomLabel();
    return;
  }
  if (kind === 'overlay') {
    renderer.renderOverlay(store.doc, uiState());
    return;
  }
  renderer.render(store.doc, tools.view, uiState());
  renderer.setExploration(store.doc, tools.ui.story || tools.ui.presenting ? {} : explorer?.state(), store.selection);
  renderer.setStory(tools.ui.story, tools.ui.storyCurrent, store.doc);
  renderer.setReadingDepth(tools.ui.presenting ? 'full' : explorer?.state().depth, tools.view.zoom);
  updateZoomLabel();
  document.getElementById('undo').disabled = !store.canUndo();
  document.getElementById('redo').disabled = !store.canRedo();
  document.getElementById('btn-remove').disabled = store.selection.size === 0;
  // A drag emits on every pointermove; the panel shows nothing that changes
  // mid-drag, and rebuilding it each frame is most of the cost of a move.
  if (!store.isDragging()) propsPanel.render();
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

// A toggle button carries its state twice: `.active` for the eye and
// aria-pressed for a screen reader, so the two never drift apart.
function setToggle(el, on) {
  el.classList.toggle('active', on);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function syncAnimation() {
  setToggle(document.getElementById('btn-animate'), tools.ui.animate);
  if (needsTicker() && !animRaf) animRaf = requestAnimationFrame(animTick);
}

store.subscribe(syncAnimation);

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
// A failure (storage full, blocked, or unavailable) is reported once per
// streak so the user knows the board only lives in this tab until saved.
let autosaveTimer = null;
let autosaveBroken = false;
store.subscribe(() => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem('schematica.autosave', serialize(store.doc));
      autosaveBroken = false;
    } catch {
      if (!autosaveBroken) {
        toast(tr('Autosave failed: this browser\'s storage is full or blocked. Save the board to a file to keep it.'));
      }
      autosaveBroken = true;
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
  setToggle(e.currentTarget, tools.ui.grid);
  render();
});
document.getElementById('btn-snap').addEventListener('click', (e) => {
  tools.ui.snapOn = !tools.ui.snapOn;
  setToggle(e.currentTarget, tools.ui.snapOn);
});

const titleInput = document.getElementById('title');
titleInput.value = store.doc.title;
titleInput.addEventListener('change', () => {
  store.apply((doc) => {
    doc.title = titleInput.value.trim() || tr('Untitled Board');
  });
  titleInput.value = store.doc.title;
});
store.subscribe(() => {
  if (document.activeElement !== titleInput) titleInput.value = store.doc.title;
});

// ---- Panels, dialogs, menus ----
initPalette({ svg, store, tools, library, editor });
initLegend();
initCompare({ store });
explorer = initExplore({ store, tools, svg, render });
dialogs = initDialogs({ store });
const recorder = initRecording({ svg, store });
const journeyUI = initJourney({ svg, store, tools, render, recorder, propsPanel });
initExamplesMenu({ store });
initLayoutToggles();
initShortcuts();
initAssistant({ store, tools, render, svg, library });

initLanguageSwitch(document.getElementById('btn-lang'));
// Flag tooltips are drawn into the SVG, so the canvas redraws on a switch.
onLanguageChange(() => render());

render();
syncAnimation();

// A share link in the URL loads the shared board at once. It never loses the
// visitor's own work: a non-empty board is kept under a backup key and the
// notice offers to bring it back, in place of a blocking confirm().
(async () => {
  if (!location.hash || location.hash.length < 4) return;
  try {
    const moment = new URLSearchParams(location.hash.slice(1));
    const boardFragment = moment.has('d') ? 'd=' + moment.get('d') : moment.has('j') ? 'j=' + moment.get('j') : '';
    if (!boardFragment) return;
    const text = await decodeShare(boardFragment);
    const { doc, warnings } = deserialize(text);
    const prev = store.doc;
    const hasWork = prev.nodes.length || prev.wires.length || prev.zones.length
      || prev.notes.length || (prev.journey || []).length;
    if (hasWork) {
      try {
        localStorage.setItem('schematica.autosave.backup', serialize(prev));
      } catch { /* backup is best-effort; the in-memory copy still restores */ }
    }
    history.replaceState(null, '', location.pathname + location.search);
    store.replaceDoc(doc);
    if (moment.has('step')) journeyUI.openMoment(moment);
    const notes = warnings.length ? tr('\n\nLoaded with warnings:\n{list}', { list: warnings.join('\n') }) : '';
    if (hasWork) {
      toast(tr('Loaded the shared board "{title}". Your previous board is kept as a backup.{notes}', { title: doc.title, notes }), {
        action: { label: tr('Restore my board'), run: () => store.replaceDoc(prev) },
      });
    } else if (warnings.length) {
      toast(tr('Shared board loaded with warnings:\n\n{list}', { list: warnings.join('\n') }));
    }
  } catch (err) {
    // Not a share link, or one this browser cannot open - leave the board alone.
    if (/too large|cannot decode/.test(err?.message || '')) toast(err.message);
  }
})();
