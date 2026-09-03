import {
  snap, normRect, rectsIntersect, nodeRect, NOTE_W, noteHeight, laneSnapPoint, contentBounds,
  resizeZone, zoneMembers, ZONE_MIN, LANE_MIN,
} from './geometry.js';
import {
  addWire, addZone, addSwimlane, addNote, updateItem, deleteItems, duplicateItems, findItem,
  rewireEnd, resolveBus,
} from './state.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { getPart } from './palette.js';
import { esc } from './render.js';

// requestRender(kind): 'all' (default) rebuilds the diagram, 'view' only moves
// the camera, 'overlay' only redraws drag feedback. Hover effects (ports,
// wire highlight) are pure CSS, so moving the pointer never re-renders.
export function createTools({ svg, store, requestRender, onToolChange, onSave }) {
  const view = { x: 40, y: 40, zoom: 1 };
  // Animate starts off, as in net_draw: wires are solid until the toggle (or a
  // wire's own "Always" flow setting) turns their traffic on.
  const ui = {
    marquee: null, wireDraft: null, grid: true, snapOn: true, animate: false,
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
  // to follow the zone rather than jitter onto lane centerlines.
  function movableSelection() {
    const orig = new Map();
    const carried = new Set();
    for (const id of store.selection) {
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        orig.set(id, { x: found.item.x, y: found.item.y });
      }
    }
    for (const id of [...orig.keys()]) {
      const found = findItem(store.doc, id);
      if (found?.type !== 'zone') continue;
      for (const mid of zoneMembers(store.doc, found.item)) {
        if (orig.has(mid)) continue;
        const m = findItem(store.doc, mid);
        if (!m) continue;
        orig.set(mid, { x: m.item.x, y: m.item.y });
        carried.add(mid);
      }
    }
    return { orig, carried };
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
    return document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.portg') || null;
  }

  function portRef(el) {
    return { node: el.dataset.node, port: el.dataset.port };
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
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'pan'))) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      capturePointer(e);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e);

    const portEl = e.target.closest('.portg');
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
      if (found) {
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
        drag = { mode: 'move', start: pt, anchor: id, ...movableSelection() };
        store.beginDrag();
        capturePointer(e);
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
      const from = ui.wireDraft.from;
      setHotPort(el && !(el.dataset.node === from.node && el.dataset.port === from.port) ? el : null);
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
      if (el && !(el.dataset.node === d.fixed.node && el.dataset.port === d.fixed.port)) {
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
      if (el && draft
        && !(el.dataset.node === draft.from.node && el.dataset.port === draft.from.port)) {
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

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function isEditingText(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  window.addEventListener('keydown', (e) => {
    if (isEditingText(e)) return;
    if (e.key === ' ') {
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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteItems(store, [...store.selection]);
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
      if (drag && (drag.mode === 'move' || drag.mode === 'zresize')) store.cancelDrag();
      if (drag?.mode === 'rewire') drag.el.classList.remove('rewiring');
      drag = null;
      ui.wireDraft = null;
      ui.marquee = null;
      setHotPort(null);
      svg.classList.remove('drafting');
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
    return getPart(node.kind).ports.find((p) => p.id === ref.port)?.bus ?? null;
  }

  function finishWire(from, to, e) {
    const busFrom = portBus(from);
    const busTo = portBus(to);
    if (busFrom && busFrom === busTo) {
      const id = addWire(store, busFrom, from, to);
      store.setSelection([id]);
      return;
    }
    const suggested = [...new Set([busFrom, busTo].filter(Boolean))];
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
    const busOther = portBus(other);
    const busNew = portBus(ref);
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
        + `${esc(b.name)}${suggested.includes(id) ? ' ★' : ''}</button>`;
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
    editor.value = found.item[field] ?? '';
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

  function commitInlineEditor() {
    if (!editing) return;
    updateItem(store, editing.id, { [editing.field]: editor.value });
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

  return { view, ui, setTool, getTool: () => tool, zoomBy, zoomReset, zoomFit, toWorld };
}
