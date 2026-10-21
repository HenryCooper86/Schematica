// Free dragging for the floating panels (Assistant, Security analysis). The
// panels live in #canvas-wrap, which clips its overflow, so a dragged panel
// is switched to viewport (position: fixed) coordinates: it can cross onto
// the palette and the toolbar while remaining a child of the canvas area, so
// the panels-hidden and presenting rules keep applying to it. The position
// is remembered per panel like the collapsed flag, with the same tolerance
// for blocked or malformed storage.
import { tr } from '../i18n.js';

const KEY = (name) => `schematica.panel.${name}.pos`;
const EDGE = 6;    // least gap between the header and the viewport's top
const REACH = 120; // enough visible header for a drag grip beside its controls
const HEADER = 36; // header height always visible at the bottom edge

function readPos(name) {
  try {
    const raw = localStorage.getItem(KEY(name));
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
    return { x: pos.x, y: pos.y };
  } catch { return null; }
}

function writePos(name, x, y) {
  try { localStorage.setItem(KEY(name), JSON.stringify({ x, y })); } catch { /* storage may be unavailable; the move still holds for this session */ }
}

// The panel touched last sits above the other floating panels, but the stack
// stays below the canvas overlays (popovers, menus, toast) it has always sat
// under: the counter is renormalized before it could climb that high.
let topmost = null;
let topZ = 21;
const raised = new Set();

export function raisePanel(panel) {
  if (topmost === panel) return;
  topmost = panel;
  if (topZ >= 29) {
    topZ = 21;
    for (const p of raised) if (p !== panel) p.style.zIndex = ++topZ;
  }
  raised.add(panel);
  panel.style.zIndex = ++topZ;
}

export function makePanelDraggable(panel, name) {
  let pos = readPos(name);
  let moved = pos !== null; // a remembered position was the user's choice
  let handle = null;
  let cancelDrag = null;
  // A panel stays at its stylesheet anchor (position: absolute inside the
  // canvas area) until the user moves it, so it keeps re-anchoring to the
  // viewport exactly as before on resize and narrow screens. The first drag
  // freezes it to viewport (position: fixed) coordinates; after that it keeps
  // the reach-grip rule: it may sit mostly off-screen, but enough header stays
  // grabbable whatever the window does.
  function clamped(x, y) {
    const pw = panel.offsetWidth || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minX = Math.min(REACH - pw, vw - REACH);
    const maxX = Math.max(minX, vw - REACH);
    const minY = EDGE;
    const maxY = Math.max(minY, vh - (handle?.offsetHeight || HEADER) - EDGE);
    return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
  }

  function place(x, y) {
    pos = { x, y };
    panel.style.position = 'fixed';
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function settle(x, y, remember) {
    // A hidden panel has no size to clamp against; it is settled again when
    // it opens.
    if (!panel.hidden) ({ x, y } = clamped(x, y));
    place(x, y);
    if (remember) writePos(name, pos.x, pos.y);
  }

  // Called each time the panel becomes visible. An unmoved panel keeps its
  // stylesheet anchor, so nothing to do. A moved panel is pulled back to a
  // reachable spot in case the window shrank while it was closed.
  function ensure() {
    if (!pos) return;
    settle(pos.x, pos.y, false);
  }

  function onPointerDown(e) {
    const h = e.currentTarget;
    if (cancelDrag || e.isPrimary === false) return;
    // Buttons and form controls in the header act on their own; the header
    // bar around them is the handle.
    if (e.target.closest('button, input, select, textarea, a, label, summary')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pos) {
      // First move: freeze the stylesheet position into viewport coordinates
      // so the panel can now cross the palette and toolbar freely.
      const r = panel.getBoundingClientRect();
      if (!r.width && !r.height) return;
      place(r.left, r.top);
    }
    raisePanel(panel);
    h.focus({ preventScroll: true });
    const start = { x: e.clientX, y: e.clientY, left: pos.x, top: pos.y };
    const pointerId = e.pointerId;
    try { h.setPointerCapture(pointerId); } catch { /* the header still tracks movement over itself */ }
    h.classList.add('dragging');
    // No text selection under the header, and no canvas pan: the pointer is
    // captured here, so the board never sees the gesture.
    e.preventDefault();
    e.stopPropagation();
    const move = ev => {
      if (ev.pointerId !== pointerId) return;
      ev.stopPropagation();
      settle(start.left + ev.clientX - start.x, start.top + ev.clientY - start.y, false);
    };
    const end = ev => {
      if (ev && ev.pointerId !== pointerId) return;
      h.classList.remove('dragging');
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', end);
      h.removeEventListener('pointercancel', end);
      h.removeEventListener('lostpointercapture', end);
      cancelDrag = null;
      if (h.hasPointerCapture(pointerId)) h.releasePointerCapture(pointerId);
      moved = true;
      writePos(name, pos.x, pos.y);
    };
    cancelDrag = end;
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    h.addEventListener('lostpointercapture', end);
  }

  // Keyboard alternative: the header is focusable and the arrow keys nudge
  // the panel (Shift for larger steps).
  function onKeyDown(e) {
    if (e.target !== e.currentTarget) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = e.shiftKey ? 48 : 12;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    if (!pos) {
      const r = panel.getBoundingClientRect();
      if (!r.width && !r.height) return;
      place(r.left, r.top);
    }
    e.preventDefault();
    e.stopPropagation();
    raisePanel(panel);
    moved = true;
    settle(pos.x + dx, pos.y + dy, true);
  }

  // The shell inside the panel is rebuilt on a language change, so the
  // handle is looked up again after every rebuild; the position lives on
  // the panel element and survives.
  function bindHandle() {
    const h = panel.querySelector('h3');
    if (!h || h === handle) return;
    cancelDrag?.();
    handle = h;
    h.classList.add('panel-drag-handle');
    h.tabIndex = 0;
    h.title = tr('Drag to move. Focus the header and press the arrow keys to nudge (Shift for larger steps).');
    h.addEventListener('pointerdown', onPointerDown);
    h.addEventListener('keydown', onKeyDown);
  }

  // Any press inside a panel brings it above its floating siblings.
  panel.addEventListener('pointerdown', () => raisePanel(panel), true);
  window.addEventListener('resize', () => { if (pos && !panel.hidden) settle(pos.x, pos.y, false); });
  const dimensions = new ResizeObserver(() => {
    if (pos && !panel.hidden && panel.offsetWidth) settle(pos.x, pos.y, false);
  });
  dimensions.observe(panel);
  const visibility = new MutationObserver(() => { if (panel.hidden) cancelDrag?.(); });
  visibility.observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  return { ensure, bindHandle };
}
