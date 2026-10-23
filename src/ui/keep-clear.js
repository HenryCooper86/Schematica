// Keeps the selected card out from under the floating right-hand panels.
// Selecting a card opens Properties (and Journey or the assistant may be
// open); if the card sits under one of them, the canvas slides sideways just
// enough for it to clear the panel. Panels stay where the user put them.
// Nothing moves while a pointer is down, so a drag is never disturbed.
const PANELS = ['props', 'journey-panel', 'assistant'];
const GAP = 16;

export function initKeepClear({ svg, store, tools, render }) {
  const wrap = document.getElementById('canvas-wrap');
  if (!svg || !wrap) return;
  let pressed = false, pending = false, raf = null;

  const visiblePanels = () => PANELS.map((id) => document.getElementById(id))
    .filter((el) => el && !el.hidden && el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width && r.height);
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  function slide(dx) {
    if (raf) cancelAnimationFrame(raf);
    const reduce = document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { tools.view.x += dx; render('view'); return; }
    const from = tools.view.x, t0 = performance.now(), dur = 220;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      tools.view.x = from + dx * (1 - (1 - t) ** 3);
      render('view');
      raf = t < 1 ? requestAnimationFrame(tick) : null;
    };
    raf = requestAnimationFrame(tick);
  }

  function check() {
    pending = false;
    if (pressed || store.isDragging?.()) { pending = true; return; }
    const ids = [...store.selection];
    if (ids.length !== 1) return;
    const card = svg.querySelector(`.node[data-id="${CSS.escape(ids[0])}"]`);
    if (!card) return;
    const c = card.getBoundingClientRect();
    const blocking = visiblePanels().filter((p) => overlaps(c, p));
    if (!blocking.length) return;
    const canvas = wrap.getBoundingClientRect();
    const edge = Math.min(...blocking.map((p) => p.left));
    const dx = edge - GAP - c.right;
    // Only slide when the whole card then fits between the canvas edge and
    // the panel; otherwise leave the view alone rather than lose the card.
    if (c.left + dx >= canvas.left + GAP) slide(dx);
  }
  // Wait a frame so the panel has rendered for the new selection.
  const schedule = () => requestAnimationFrame(() => requestAnimationFrame(check));

  store.subscribe((change) => { if (change === 'selection') schedule(); });
  svg.addEventListener('pointerdown', () => { pressed = true; if (raf) { cancelAnimationFrame(raf); raf = null; } });
  window.addEventListener('pointerup', () => { pressed = false; if (pending) schedule(); });
  window.addEventListener('pointercancel', () => { pressed = false; });
}
