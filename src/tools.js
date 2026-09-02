import {
  snap, normRect, rectsIntersect, nodeRect, NOTE_W, noteHeight, laneSnapPoint, contentBounds,
} from './geometry.js';
import {
  addWire, addZone, addSwimlane, addNote, updateItem, deleteItems, duplicateItems, findItem,
} from './state.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { getPart } from './palette.js';
import { esc } from './render.js';

export function createTools({ svg, store, requestRender, onToolChange, onSave }) {
  const view = { x: 40, y: 40, zoom: 1 };
  const ui = {
    marquee: null, wireDraft: null, hoverPort: null, hoverNode: null,
    grid: true, snapOn: true, animate: true,
  };
  let tool = 'select';
  let spaceDown = false;
  let drag = null;

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

  function setTool(t) {
    tool = t;
    ui.wireDraft = null;
    svg.classList.toggle('tool-wire', t === 'wire');
    svg.classList.toggle('tool-pan', t === 'pan');
    onToolChange?.(t);
    requestRender();
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
    requestRender();
  }

  function zoomBy(factor) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }

  function zoomReset() {
    view.x = 40;
    view.y = 40;
    view.zoom = 1;
    requestRender();
  }

  function zoomFit() {
    const b = contentBounds(store.doc, getPart);
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
    requestRender();
  }

  function movableSelection() {
    const orig = new Map();
    for (const id of store.selection) {
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        orig.set(id, { x: found.item.x, y: found.item.y });
      }
    }
    return orig;
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

  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'pan'))) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      capturePointer(e);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e);

    const portEl = e.target.closest('.port');
    if (portEl) {
      ui.wireDraft = {
        from: { node: portEl.dataset.node, port: portEl.dataset.port },
        cursor: pt,
      };
      drag = { mode: 'wire' };
      capturePointer(e);
      requestRender();
      return;
    }

    if (tool === 'zone' || tool === 'lane') {
      drag = { mode: 'zone', start: pt, lane: tool === 'lane' };
      ui.marquee = { x: pt.x, y: pt.y, w: 0, h: 0 };
      capturePointer(e);
      requestRender();
      return;
    }
    if (tool === 'note') {
      const id = addNote(store, doSnap(pt.x), doSnap(pt.y));
      store.setSelection([id]);
      setTool('select');
      return;
    }

    const itemEl = e.target.closest('[data-type]');
    if (itemEl) {
      const id = itemEl.dataset.id;
      if (e.shiftKey) {
        store.toggleSelection(id);
      } else if (!store.selection.has(id)) {
        store.setSelection([id]);
      }
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        drag = { mode: 'move', start: pt, orig: movableSelection() };
        store.beginDrag();
        capturePointer(e);
      }
      requestRender();
      return;
    }

    if (!e.shiftKey) store.clearSelection();
    drag = { mode: 'marquee', start: pt, additive: e.shiftKey };
    capturePointer(e);
    requestRender();
  });

  svg.addEventListener('pointermove', (e) => {
    const pt = toWorld(e);
    if (!drag) {
      const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      const hp = portEl ? { node: portEl.dataset.node, port: portEl.dataset.port } : null;
      // Ports render only on the hovered node (like net_draw). Hover is
      // detected geometrically with a margin because the port circles straddle
      // the card edge and must be reachable from just outside it.
      const PAD = 12;
      let hn = null;
      for (const n of store.doc.nodes) {
        if (pt.x >= n.x - PAD && pt.x <= n.x + n.w + PAD
          && pt.y >= n.y - PAD && pt.y <= n.y + n.h + PAD) hn = n.id;
      }
      if (JSON.stringify(hp) !== JSON.stringify(ui.hoverPort) || hn !== ui.hoverNode) {
        ui.hoverPort = hp;
        ui.hoverNode = hn;
        requestRender();
      }
      return;
    }
    if (drag.mode === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      requestRender();
      return;
    }
    if (drag.mode === 'wire') {
      ui.wireDraft.cursor = pt;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      ui.hoverPort = el ? { node: el.dataset.node, port: el.dataset.port } : null;
      requestRender();
      return;
    }
    if (drag.mode === 'marquee' || drag.mode === 'zone') {
      ui.marquee = normRect(drag.start.x, drag.start.y, pt.x, pt.y);
      requestRender();
      return;
    }
    if (drag.mode === 'move') {
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      store.mutate((doc) => {
        for (const [id, o] of drag.orig) {
          const found = findItem(doc, id);
          if (!found) continue;
          found.item.x = doSnap(o.x + dx);
          found.item.y = doSnap(o.y + dy);
          // Inside a swimlane, a node's center is pulled onto the nearest
          // lane centerline while snap is on.
          if (ui.snapOn && found.type === 'node') {
            const n = found.item;
            const c = laneSnapPoint(doc, n.x + n.w / 2, n.y + n.h / 2);
            n.x = c.x - n.w / 2;
            n.y = c.y - n.h / 2;
          }
        }
      });
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (drag.mode === 'wire') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      const draft = ui.wireDraft;
      ui.wireDraft = null;
      ui.hoverPort = null;
      if (el && draft
        && !(el.dataset.node === draft.from.node && el.dataset.port === draft.from.port)) {
        finishWire(draft.from, { node: el.dataset.node, port: el.dataset.port }, e);
      }
      drag = null;
      requestRender();
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
      requestRender();
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
    } else if (drag.mode === 'move') {
      store.endDrag();
    }
    drag = null;
    requestRender();
  });

  svg.addEventListener('pointerleave', () => {
    if ((ui.hoverNode || ui.hoverPort) && !drag) {
      ui.hoverNode = null;
      ui.hoverPort = null;
      requestRender();
    }
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
    if (e.key === 'Escape') {
      if (drag && drag.mode === 'move') store.cancelDrag();
      drag = null;
      ui.wireDraft = null;
      ui.marquee = null;
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
      return `<button data-bus="${esc(id)}"><span class="swatch" style="background:${esc(b.color)}"></span>`
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
    editor.focus();
    editor.select();
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

  svg.addEventListener('dblclick', (e) => {
    const itemEl = e.target.closest('[data-type]');
    if (!itemEl) return;
    const editEl = e.target.closest('[data-edit]');
    const defaults = { node: 'label', wire: 'label', zone: 'label', note: 'text' };
    const field = editEl?.dataset.edit || defaults[itemEl.dataset.type];
    openInlineEditor(itemEl.dataset.id, field, e.clientX, e.clientY);
  });

  return { view, ui, setTool, getTool: () => tool, zoomBy, zoomReset, zoomFit, toWorld };
}
