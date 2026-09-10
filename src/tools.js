import {
  snap, normRect, rectsIntersect, nodeRect, NOTE_W, noteHeight, laneSnapPoint, contentBounds,
  resizeZone, zoneMembers, ZONE_MIN, LANE_MIN,
} from './geometry.js';
import {
  addWire, addZone, addSwimlane, addNote, updateItem, deleteItems, duplicateItems, findItem,
  rewireEnd, resolveBus, isLocked, nextLockState, setLock, lockedKeptMessage,
} from './state.js';
import { alignMoves, distributeMoves, tidyMoves, alignAbility } from './align.js';
import {
  buildClip, encodeClip, readClip, pasteInto, clipCount, copiedMessage, pastedMessage,
  MAX_CLIP_ITEMS,
} from './clipboard.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { nodePart } from './rdk/profiles.js';
import { esc } from './render.js';
import { toast } from './ui/press.js';
import { tr, trd } from './i18n.js';

// requestRender(kind): 'all' (default) rebuilds the diagram, 'view' only moves
// the camera, 'overlay' only redraws drag feedback. Hover effects (ports,
// wire highlight) are pure CSS, so moving the pointer never re-renders.
export function createTools({ svg, store, requestRender, onToolChange, onSave, library }) {
  const view = { x: 40, y: 40, zoom: 1 };
  // Animate starts off, as in net_draw: wires are solid until the toggle (or a
  // wire's own "Always" flow setting) turns their traffic on.
  const ui = {
    marquee: null, wireDraft: null, grid: true, snapOn: true, animate: false,
    highlight: new Set(), // ids the assistant just touched; cleared by the next press
    // The assistant is mid-request: the canvas ignores presses and keys. Named
    // for the app being busy, not for item.locked, which is the user pinning
    // one item and has nothing to do with it.
    busy: false,
  };
  let tool = 'select';
  let spaceDown = false;
  let drag = null;
  let hotPort = null; // the port under a wire being dragged, marked via data-hot

  function capturePointer(e) {
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events may carry a pointerId with no active pointer.
    }
  }

  function toWorld(e) {
    const r = svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.x) / view.zoom,
      y: (e.clientY - r.top - view.y) / view.zoom,
    };
  }

  // Nothing in the diagram depends on the tool (ports reveal via the
  // tool-wire class), so a tool switch only clears transient overlay state.
  function setTool(t) {
    tool = t;
    ui.wireDraft = null;
    svg.classList.toggle('tool-wire', t === 'wire');
    svg.classList.toggle('tool-pan', t === 'pan');
    onToolChange?.(t);
    requestRender('overlay');
  }

  function doSnap(v) {
    return ui.snapOn ? snap(v) : Math.round(v);
  }

  function zoomAt(cx, cy, factor) {
    const z = Math.min(4, Math.max(0.2, view.zoom * factor));
    const k = z / view.zoom;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.zoom = z;
    requestRender('view');
  }

  function zoomBy(factor) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }

  function zoomReset() {
    view.x = 40;
    view.y = 40;
    view.zoom = 1;
    requestRender('view');
  }

  function zoomFit() {
    const b = contentBounds(store.doc);
    if (!b) { zoomReset(); return; }
    const r = svg.getBoundingClientRect();
    const M = 40;
    const z = Math.min(4, Math.max(0.2, Math.min(
      (r.width - M * 2) / Math.max(b.w, 1),
      (r.height - M * 2) / Math.max(b.h, 1),
      1.5,
    )));
    view.zoom = z;
    view.x = r.width / 2 - (b.x + b.w / 2) * z;
    view.y = r.height / 2 - (b.y + b.h / 2) * z;
    requestRender('view');
  }

  // Everything the selection drags: its own nodes, zones, and notes, plus the
  // cards and notes inside any selected zone (net_draw moves a zone with its
  // contents). `carried` marks those passengers so lane snapping leaves them
  // to follow the zone rather than jitter onto lane centerlines. Locked items
  // are left out at both levels: a locked card inside a moving zone stays
  // where it is while the zone travels over it.
  function movableSelection() {
    const orig = new Map();
    const carried = new Set();
    for (const id of store.selection) {
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire' && !isLocked(found.item)) {
        orig.set(id, { x: found.item.x, y: found.item.y });
      }
    }
    for (const id of [...orig.keys()]) {
      const found = findItem(store.doc, id);
      if (found?.type !== 'zone') continue;
      for (const mid of zoneMembers(store.doc, found.item)) {
        if (orig.has(mid)) continue;
        const m = findItem(store.doc, mid);
        if (!m || isLocked(m.item)) continue;
        orig.set(mid, { x: m.item.x, y: m.item.y });
        carried.add(mid);
      }
    }
    return { orig, carried };
  }

  // Everything a marquee dragged across the whole board would pick up: cards,
  // zones, and notes. Wires are left out for the same reason hitMarquee leaves
  // them out — a wire has no position of its own, so nothing a multi-selection
  // offers (align, distribute, tidy, nudge, lock) can act on one, and it would
  // only inflate the count the panel shows. A copy still takes every wire whose
  // two ends are selected, and deleting the cards takes their wires with them,
  // so nothing is lost by not naming them here.
  function selectAll() {
    const doc = store.doc;
    store.setSelection([...doc.nodes, ...doc.zones, ...doc.notes].map((i) => i.id));
  }

  // Lock the selection, or unlock it once every lockable item is locked.
  function toggleLock() {
    const ids = [...store.selection];
    const next = nextLockState(store.doc, ids);
    if (next === null) return;
    setLock(store, ids, next);
  }

  // Arrow keys move the selection by a pixel, or a grid step with Shift.
  function nudgeSelection(dx, dy) {
    const { orig } = movableSelection();
    if (!orig.size) return;
    store.apply((doc) => {
      for (const [id, o] of orig) {
        const found = findItem(doc, id);
        if (!found) continue;
        found.item.x = o.x + dx;
        found.item.y = o.y + dy;
      }
    });
  }

  // ---- Align, distribute, tidy ----
  // The rectangles the alignment math works on: every selected card, note, and
  // zone, measured the way the canvas draws it. A card's width follows its
  // content, so a right-align has to read nodeRect(), not a constant, or two
  // cards of different widths would keep two different right edges.
  function selectionRects() {
    const rects = [];
    for (const id of store.selection) {
      const found = findItem(store.doc, id);
      if (!found || found.type === 'wire') continue;
      const it = found.item;
      const box = found.type === 'node' ? nodeRect(it)
        : found.type === 'note' ? { x: it.x, y: it.y, w: NOTE_W, h: noteHeight(it.text) }
          : { x: it.x, y: it.y, w: it.w, h: it.h };
      rects.push({ id, ...box, locked: isLocked(it) });
    }
    return rects;
  }

  // Apply computed positions as one undo step. A zone that moves carries the
  // unlocked cards and notes inside it, exactly as dragging it does; a
  // passenger that is itself in the selection keeps its own aligned position
  // instead of the ride. Memberships are read before anything moves, so two
  // zones travelling at once cannot steal each other's cards.
  // `own` is every item the alignment considered, not merely the ones it moved:
  // an item already on the target edge emits no move, and it is precisely the
  // one the user must find still on that edge afterwards — riding a zone would
  // carry the one item that was already right off the line.
  // Results are never snapped to the grid: snapping each item on its own would
  // undo the alignment it was just given (a centered card's left edge is its
  // center minus half its own width, which is rarely a grid multiple), and an
  // even gap is not generally a whole number of grid steps.
  function applyMoves(moves, own) {
    if (!moves.length) return;
    store.apply((doc) => {
      const rides = new Map();
      for (const m of moves) {
        const found = findItem(doc, m.id);
        if (found?.type !== 'zone') continue;
        for (const mid of zoneMembers(doc, found.item)) {
          if (own.has(mid) || rides.has(mid)) continue;
          const p = findItem(doc, mid);
          if (p && !isLocked(p.item)) rides.set(mid, { item: p.item, dx: m.x - found.item.x, dy: m.y - found.item.y });
        }
      }
      for (const m of moves) {
        const found = findItem(doc, m.id);
        if (found) Object.assign(found.item, { x: m.x, y: m.y });
      }
      for (const r of rides.values()) {
        r.item.x += r.dx;
        r.item.y += r.dy;
      }
    });
  }

  // One measurement feeds both the arithmetic and the set of items that hold
  // their own position, so the two can never disagree about who took part.
  function layoutSelection(compute) {
    const rects = selectionRects();
    applyMoves(compute(rects), new Set(rects.map((r) => r.id)));
  }

  function alignSelection(mode) {
    layoutSelection((rects) => alignMoves(rects, mode));
  }

  function distributeSelection(axis) {
    layoutSelection((rects) => distributeMoves(rects, axis));
  }

  function tidySelection(gap) {
    layoutSelection((rects) => tidyMoves(rects, { gap }));
  }

  function alignState() {
    return alignAbility(selectionRects());
  }

  function hitMarquee(doc, m) {
    const ids = [];
    for (const n of doc.nodes) if (rectsIntersect(m, nodeRect(n))) ids.push(n.id);
    for (const t of doc.notes) if (rectsIntersect(m, { x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) })) ids.push(t.id);
    for (const z of doc.zones) {
      const inside = z.x >= m.x && z.y >= m.y && z.x + z.w <= m.x + m.w && z.y + z.h <= m.y + m.h;
      if (inside) ids.push(z.id);
    }
    return ids;
  }

  function portUnder(e) {
    return document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.portg:not([data-unsupported])') || null;
  }

  function portRef(el) {
    return { node: el.dataset.node, port: el.dataset.port };
  }

  // A wire may only land on another node: a self-loop (both ends on the same
  // node, even on different ports) has no meaning on a board.
  function canLandOn(el, from) {
    return !!el && el.dataset.node !== from.node;
  }

  function setHotPort(el) {
    if (hotPort === el) return;
    hotPort?.removeAttribute('data-hot');
    hotPort = el;
    el?.setAttribute('data-hot', '');
  }

  // Own double-click detection, as in net_draw: pointer capture retargets the
  // native dblclick to the svg itself, so the rename gesture is a second press
  // on the same item within 420ms and 8px.
  let lastPress = { key: null, t: 0, x: 0, y: 0 };
  function isDoubleClick(key, e) {
    const now = performance.now();
    const dbl = lastPress.key === key && now - lastPress.t < 420
      && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 8;
    lastPress = dbl ? { key: null, t: 0, x: 0, y: 0 } : { key, t: now, x: e.clientX, y: e.clientY };
    return dbl;
  }

  const EDIT_FIELDS = { node: 'label', wire: 'label', zone: 'label', note: 'text' };

  svg.addEventListener('pointerdown', (e) => {
    if (ui.busy) return;
    if (ui.highlight.size) {
      ui.highlight.clear();
      requestRender('overlay');
    }
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'pan'))) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      capturePointer(e);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e);

    const portEl = e.target.closest('.portg');
    if (portEl?.dataset.unsupported) return;
    if (portEl) {
      ui.wireDraft = { from: portRef(portEl), cursor: pt };
      drag = { mode: 'wire' };
      svg.classList.add('drafting');
      capturePointer(e);
      requestRender('overlay');
      return;
    }

    if (tool === 'zone' || tool === 'lane') {
      drag = { mode: 'zone', start: pt, lane: tool === 'lane' };
      ui.marquee = { x: pt.x, y: pt.y, w: 0, h: 0, kind: 'zone' };
      capturePointer(e);
      requestRender('overlay');
      return;
    }
    if (tool === 'note') {
      const id = addNote(store, doSnap(pt.x), doSnap(pt.y));
      store.setSelection([id]);
      setTool('select');
      return;
    }

    // An endpoint handle on a selected wire starts a re-attach: the other end
    // stays put and a draft follows the pointer until it lands on a port.
    const wendEl = e.target.closest('[data-wend]');
    if (wendEl) {
      const wireEl = wendEl.closest('[data-type="wire"]');
      const found = wireEl && findItem(store.doc, wireEl.dataset.id);
      if (found?.type === 'wire') {
        const end = wendEl.dataset.wend;
        const fixed = end === 'to' ? found.item.from : found.item.to;
        drag = { mode: 'rewire', id: found.item.id, end, fixed, el: wireEl };
        wireEl.classList.add('rewiring');
        ui.wireDraft = { from: fixed, cursor: pt };
        svg.classList.add('drafting');
        capturePointer(e);
        requestRender('overlay');
        return;
      }
    }

    // A corner handle on a selected zone starts a resize; the opposite corner
    // stays put (net_draw's zhandle drag).
    const handleEl = e.target.closest('[data-zhandle]');
    if (handleEl) {
      const zoneEl = handleEl.closest('[data-type="zone"]');
      const found = zoneEl && findItem(store.doc, zoneEl.dataset.id);
      // A locked zone draws no handles, so this only guards a stale one.
      if (found && !isLocked(found.item)) {
        drag = { mode: 'zresize', id: found.item.id, corner: handleEl.dataset.zhandle, from: { ...found.item } };
        store.beginDrag();
        capturePointer(e);
        return;
      }
    }

    const itemEl = e.target.closest('[data-type]');
    if (itemEl) {
      const id = itemEl.dataset.id;
      if (isDoubleClick(id, e)) {
        const editEl = e.target.closest('[data-edit]');
        openInlineEditor(id, editEl?.dataset.edit || EDIT_FIELDS[itemEl.dataset.type], e.clientX, e.clientY);
        return;
      }
      if (e.shiftKey) {
        store.toggleSelection(id);
      } else if (!store.selection.has(id)) {
        store.setSelection([id]);
      }
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        // A shift-click that toggled off the last selected item leaves
        // nothing to move; a drag with an empty orig map has no anchor.
        const movable = movableSelection();
        if (movable.orig.size) {
          drag = { mode: 'move', start: pt, anchor: id, ...movable };
          store.beginDrag();
          capturePointer(e);
        }
      }
      return;
    }

    if (!e.shiftKey) store.clearSelection();
    drag = { mode: 'marquee', start: pt, additive: e.shiftKey };
    capturePointer(e);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = toWorld(e);
    if (drag.mode === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      requestRender('view');
      return;
    }
    if (drag.mode === 'wire' || drag.mode === 'rewire') {
      ui.wireDraft.cursor = pt;
      const el = portUnder(e);
      setHotPort(canLandOn(el, ui.wireDraft.from) ? el : null);
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'marquee' || drag.mode === 'zone') {
      ui.marquee = { ...normRect(drag.start.x, drag.start.y, pt.x, pt.y), kind: drag.mode === 'zone' ? 'zone' : 'select' };
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'zresize') {
      store.mutate((doc) => {
        const found = findItem(doc, drag.id);
        if (!found) return;
        const min = found.item.kind === 'swimlane' ? LANE_MIN : ZONE_MIN;
        Object.assign(found.item, resizeZone(drag.from, drag.corner, doSnap(pt.x), doSnap(pt.y), min));
      });
      return;
    }
    if (drag.mode === 'move') {
      // One snapped delta for the whole selection, anchored on the item that
      // was pressed, so a group (or a zone and its passengers) keeps its
      // relative layout instead of every item snapping on its own.
      const anchor = drag.orig.get(drag.anchor) || drag.orig.values().next().value;
      const dx = doSnap(anchor.x + pt.x - drag.start.x) - anchor.x;
      const dy = doSnap(anchor.y + pt.y - drag.start.y) - anchor.y;
      store.mutate((doc) => {
        for (const [id, o] of drag.orig) {
          const found = findItem(doc, id);
          if (!found) continue;
          found.item.x = o.x + dx;
          found.item.y = o.y + dy;
          // Inside a swimlane, a node's center is pulled onto the nearest
          // lane centerline while snap is on — unless it is riding a zone.
          if (ui.snapOn && found.type === 'node' && !drag.carried.has(id)) {
            const n = found.item;
            const r = nodeRect(n);
            const c = laneSnapPoint(doc, r.x + r.w / 2, r.y + r.h / 2);
            n.x = c.x - r.w / 2;
            n.y = c.y - r.h / 2;
          }
        }
      });
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (drag.mode === 'rewire') {
      const d = drag;
      drag = null;
      const el = portUnder(e);
      ui.wireDraft = null;
      setHotPort(null);
      svg.classList.remove('drafting');
      d.el.classList.remove('rewiring');
      if (canLandOn(el, d.fixed)) {
        finishRewire(d.id, d.end, portRef(el), e);
      }
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'wire') {
      const el = portUnder(e);
      const draft = ui.wireDraft;
      ui.wireDraft = null;
      setHotPort(null);
      svg.classList.remove('drafting');
      if (draft && canLandOn(el, draft.from)) {
        finishWire(draft.from, portRef(el), e);
      }
      drag = null;
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'zone') {
      const m = ui.marquee;
      ui.marquee = null;
      if (m && m.w > 16 && m.h > 16) {
        const rect = { x: doSnap(m.x), y: doSnap(m.y), w: doSnap(m.w), h: doSnap(m.h) };
        const id = drag.lane ? addSwimlane(store, rect) : addZone(store, rect);
        store.setSelection([id]);
      }
      setTool('select');
      drag = null;
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'marquee') {
      const m = ui.marquee;
      ui.marquee = null;
      if (m && (m.w > 2 || m.h > 2)) {
        const hits = hitMarquee(store.doc, m);
        if (drag.additive) {
          for (const id of hits) store.selection.add(id);
          store.setSelection([...store.selection]);
        } else {
          store.setSelection(hits);
        }
      }
      drag = null;
      requestRender('overlay');
      return;
    }
    if (drag.mode === 'move' || drag.mode === 'zresize') {
      store.endDrag();
    }
    drag = null;
  });

  // Drops whatever gesture is in flight and puts moved items back: Escape,
  // or a pointer the browser took away (touch cancel, OS gesture, capture
  // lost). A move or resize that never ended must not cost an undo step.
  function abandonDrag() {
    if (drag && (drag.mode === 'move' || drag.mode === 'zresize')) store.cancelDrag();
    if (drag?.mode === 'rewire') drag.el.classList.remove('rewiring');
    drag = null;
    ui.wireDraft = null;
    ui.marquee = null;
    setHotPort(null);
    svg.classList.remove('drafting');
  }

  svg.addEventListener('pointercancel', (e) => {
    if (!drag) return;
    abandonDrag();
    try { svg.releasePointerCapture(e.pointerId); } catch { /* capture already gone */ }
    requestRender('overlay');
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function isEditingText(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  // Whether the user has words highlighted anywhere in the page. Most of the
  // app's text lives outside form controls — the assistant transcript is a
  // plain <aside>, the check findings and the BOM are plain lists — so
  // isEditingText() alone does not see a selection there.
  function hasTextSelection() {
    const sel = globalThis.getSelection?.();
    return !!sel && !sel.isCollapsed && !!String(sel).trim();
  }

  // ---- Copy, cut, paste ----
  // The payload itself is built and validated in src/clipboard.js; this layer
  // is only the clipboard API, the toasts, and the guards.

  // What this tab copied last. A browser that denies the clipboard (a file://
  // page, a denied permission, no secure context) still gets copy and paste
  // within the tab, the way the PNG copy falls back to a download.
  let memoryClip = null;

  // Read-only view of the part library, to tell a pasted custom card whose
  // template id this browser already knows from one it has never seen. A
  // caller that has no library (a test, say) simply finds nothing.
  const templates = library || { get: () => null };

  // A dialog or a mid-request assistant may take the board over while the
  // clipboard read is in flight; a paste that landed after that would edit a
  // board the user is no longer driving.
  function canEditNow() {
    return !ui.busy && !document.querySelector('dialog[open]');
  }

  async function copySelection({ cut = false } = {}) {
    const clip = buildClip(store.doc, [...store.selection]);
    if (!clip) {
      toast(tr('Select a part, zone, or note to copy.'));
      return;
    }
    const n = clipCount(clip);
    if (n > MAX_CLIP_ITEMS) {
      toast(tr('A copy is limited to {max} items; this selection holds {n}.', { max: MAX_CLIP_ITEMS, n }));
      return;
    }
    const text = encodeClip(clip);
    memoryClip = text;
    // Still inside the keypress, so the write carries its user activation.
    const api = globalThis.navigator?.clipboard;
    let shared = false;
    if (api?.writeText) {
      try {
        await api.writeText(text);
        shared = true;
      } catch { /* denied: the in-tab copy above is the fallback */ }
    }
    // A locked item is copied but never removed, and is counted the way Delete
    // counts it. A dialog or an assistant request that took the board over
    // while the write was in flight removes nothing, so the notice says copied.
    const removed = cut && canEditNow();
    const kept = removed ? lockedKeptMessage(deleteItems(store, [...store.selection]).kept) : null;
    toast([
      copiedMessage(n, { cut: removed }),
      kept,
      shared ? null : tr('The clipboard was blocked, so this copy stays in this tab.'),
    ].filter(Boolean).join(' '));
  }

  async function pasteClipboard() {
    const api = globalThis.navigator?.clipboard;
    let text = null;
    if (api?.readText) {
      try { text = await api.readText(); } catch { text = null; }
    }
    // A denied or empty read falls back to this tab's own copy; text that was
    // read successfully is used as it is, so a paste never resurrects an
    // older copy over what the user has since put on the clipboard.
    if (!text) text = memoryClip;
    if (!canEditNow()) return;
    let clip;
    let warnings;
    try {
      ({ clip, warnings } = readClip(text));
    } catch (err) {
      toast(err.message);
      return;
    }
    const ids = pasteInto(store, clip, { templateFor: (lib) => templates.get(lib) });
    store.setSelection(ids);
    toast(warnings.length
      ? tr('Pasted with warnings:\n\n{list}', { list: warnings.join('\n') })
      : pastedMessage(ids.length));
  }

  window.addEventListener('keydown', (e) => {
    // A modal dialog owns the keyboard: Escape closes it, nothing reaches the canvas.
    if (document.querySelector('dialog[open]')) return;
    if (ui.busy) return;
    if (isEditingText(e)) return;
    // Mid-gesture only Escape (abandon) is meaningful: undo, delete, duplicate
    // or a tool switch would corrupt history or pull the draft from under a
    // pointermove that is still in flight.
    if (drag && e.key !== 'Escape') return;
    if (e.key === ' ') {
      // Space is the pan modifier only when focus sits on the canvas or the
      // page itself; a focused button must still activate on Space.
      if (e.target !== svg && e.target !== document.body) return;
      spaceDown = true;
      svg.classList.add('panning');
      e.preventDefault();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      store.redo();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const ids = duplicateItems(store, [...store.selection]);
      if (ids.length) store.setSelection(ids);
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      // Without this the key falls through to the browser and selects the
      // page's own text, which is never what it means over a board.
      e.preventDefault();
      selectAll();
      return;
    }
    // Copy, cut, and paste reach here only when no text field, dialog, or
    // assistant request owns the keyboard, so the browser's own clipboard
    // inside a text field keeps working untouched.
    // Highlighted text wins too, wherever it is: a user who selected a passage
    // of the assistant's reply and pressed Ctrl-C wants that passage, and the
    // board's own copy would both swallow the keypress and overwrite it.
    if (mod && 'cxv'.includes(e.key.toLowerCase()) && hasTextSelection()) return;
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      copySelection({ cut: true });
      return;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteClipboard();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      // A mixed selection loses its unlocked half; say what stayed behind so
      // the missing deletion does not read as a dropped keypress.
      const msg = lockedKeptMessage(deleteItems(store, [...store.selection]).kept);
      if (msg) toast(msg);
      return;
    }
    if (e.key.startsWith('Arrow') && !mod) {
      if (!store.selection.size) return;
      e.preventDefault();
      const step = e.shiftKey ? 8 : 1;
      nudgeSelection(
        e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
        e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
      );
      return;
    }
    if (e.key === 'Escape') {
      abandonDrag();
      closeBusPopover();
      store.clearSelection();
      requestRender();
      return;
    }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    if (k === 'c') setTool('wire');
    if (k === 'z') setTool('zone');
    if (k === 'l') setTool('lane');
    if (k === 'n') setTool('note');
    if (k === 'h') setTool('pan');
    if (k === 'f') zoomFit();
    if (k === 'k') toggleLock();
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceDown = false;
      svg.classList.remove('panning');
    }
  });

  function portBus(ref) {
    const node = store.doc.nodes.find((n) => n.id === ref.node);
    if (!node) return null;
    return nodePart(node).ports.find((p) => p.id === ref.port)?.bus ?? null;
  }

  function finishWire(from, to, e) {
    if (from.node === to.node) return; // no self-loops
    const busFrom = portBus(from);
    const busTo = portBus(to);
    if (!busFrom || !busTo) return;
    if (busFrom === busTo) {
      const id = addWire(store, busFrom, from, to);
      store.setSelection([id]);
      return;
    }
    const suggested = [...new Set([busFrom, busTo])];
    openBusPopover(e.clientX, e.clientY, suggested, (bus) => {
      const id = addWire(store, bus, from, to);
      store.setSelection([id]);
    });
  }

  // Re-attach one end of a wire. The bus follows the new pair of ports: an
  // agreed bus is adopted, a still-matching current bus is kept, otherwise the
  // picker asks — and the wire stays put until a bus is chosen.
  function finishRewire(id, end, ref, e) {
    const wire = findItem(store.doc, id)?.item;
    if (!wire) return;
    const other = end === 'to' ? wire.from : wire.to;
    if (other.node === ref.node) return; // no self-loops
    const busOther = portBus(other);
    const busNew = portBus(ref);
    if (!busNew) return;
    const bus = resolveBus(wire.bus, busOther, busNew);
    if (bus) {
      rewireEnd(store, id, end, ref, bus);
      store.setSelection([id]);
      return;
    }
    const suggested = [...new Set([busOther, busNew].filter(Boolean))];
    openBusPopover(e.clientX, e.clientY, suggested, (picked) => {
      rewireEnd(store, id, end, ref, picked);
      store.setSelection([id]);
    });
  }

  const popover = document.getElementById('bus-popover');
  let popoverDismiss = null;

  function closeBusPopover() {
    popover.hidden = true;
    popover.innerHTML = '';
    if (popoverDismiss) {
      window.removeEventListener('pointerdown', popoverDismiss);
      popoverDismiss = null;
    }
  }

  function openBusPopover(cx, cy, suggested, onPick) {
    const order = [...suggested, ...BUS_ORDER.filter((b) => !suggested.includes(b))];
    popover.innerHTML = order.map((id) => {
      const b = BUSES[id];
      return `<button data-bus="${esc(id)}"><span class="bus-chip">${esc(b.short)}</span>`
        + `${esc(trd(b.name))}${suggested.includes(id) ? ' ★' : ''}</button>`;
    }).join('');
    popover.style.left = `${Math.min(cx, window.innerWidth - 190)}px`;
    popover.style.top = `${Math.min(cy, window.innerHeight - 320)}px`;
    popover.hidden = false;
    popover.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeBusPopover();
        onPick(btn.dataset.bus);
      });
    });
    setTimeout(() => {
      if (popoverDismiss) window.removeEventListener('pointerdown', popoverDismiss);
      popoverDismiss = (ev) => {
        if (!popover.contains(ev.target)) closeBusPopover();
      };
      window.addEventListener('pointerdown', popoverDismiss);
    }, 0);
  }

  const editor = document.getElementById('inline-editor');
  let editing = null; // { id, field }

  function openInlineEditor(id, field, cx, cy) {
    const found = findItem(store.doc, id);
    if (!found) return;
    editing = { id, field };
    editor.value = readField(found.item, field) ?? '';
    editor.style.left = `${Math.min(cx - 100, window.innerWidth - 210)}px`;
    editor.style.top = `${cy - 14}px`;
    editor.hidden = false;
    // Defer focus: the pointerdown that opened the editor moves focus as its
    // default action, which would blur (and commit) the editor at once.
    setTimeout(() => {
      if (editing) {
        editor.focus();
        editor.select();
      }
    }, 0);
  }

  // Meta lines of schema parts edit into node.fields ("fields.<id>").
  function readField(item, field) {
    return field.startsWith('fields.') ? item.fields?.[field.slice(7)] : item[field];
  }

  function fieldPatch(item, field, value) {
    if (!field.startsWith('fields.')) return { [field]: value };
    const fields = { ...(item.fields || {}) };
    if (value.trim()) fields[field.slice(7)] = value.trim();
    else delete fields[field.slice(7)];
    // An empty map is dropped on load, so keep the in-memory doc identical to
    // its serialized form: no key rather than {}.
    return { fields: Object.keys(fields).length ? fields : undefined };
  }

  function commitInlineEditor() {
    if (!editing) return;
    const cur = findItem(store.doc, editing.id)?.item;
    if (cur) updateItem(store, editing.id, fieldPatch(cur, editing.field, editor.value));
    editing = null;
    editor.hidden = true;
  }

  function cancelInlineEditor() {
    editing = null;
    editor.hidden = true;
  }

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitInlineEditor();
    if (e.key === 'Escape') cancelInlineEditor();
    e.stopPropagation();
  });
  editor.addEventListener('blur', commitInlineEditor);

  return {
    view, ui, setTool, zoomBy, zoomReset, zoomFit, toWorld,
    alignSelection, distributeSelection, tidySelection, alignState,
  };
}
