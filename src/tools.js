import { snap, normRect, rectsIntersect, nodeRect } from './geometry.js';
import { deleteItems, duplicateItems, findItem } from './state.js';

export function createTools({ svg, store, requestRender, onToolChange }) {
  const view = { x: 40, y: 40, zoom: 1 };
  const ui = { marquee: null, wireDraft: null, hoverPort: null, grid: true };
  let tool = 'select';
  let spaceDown = false;
  let drag = null;

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
    onToolChange?.(t);
    requestRender();
  }

  function doSnap(v) {
    return ui.grid ? snap(v) : Math.round(v);
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
    for (const t of doc.notes) if (rectsIntersect(m, { x: t.x, y: t.y, w: 160, h: 40 })) ids.push(t.id);
    for (const z of doc.zones) {
      const inside = z.x >= m.x && z.y >= m.y && z.x + z.w <= m.x + m.w && z.y + z.h <= m.y + m.h;
      if (inside) ids.push(z.id);
    }
    return ids;
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e);

    const portEl = e.target.closest('.port');
    if (portEl) {
      // Wire drawing lands in Task 7; until then a port click selects its node.
      store.setSelection([portEl.dataset.node]);
      return;
    }

    if (tool === 'zone' || tool === 'note') {
      // Zone/note creation lands in Task 8; until then these tools do nothing on the canvas.
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
        svg.setPointerCapture(e.pointerId);
      }
      requestRender();
      return;
    }

    if (!e.shiftKey) store.clearSelection();
    drag = { mode: 'marquee', start: pt, additive: e.shiftKey };
    svg.setPointerCapture(e.pointerId);
    requestRender();
  });

  svg.addEventListener('pointermove', (e) => {
    const pt = toWorld(e);
    if (!drag) {
      const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      const hp = portEl ? { node: portEl.dataset.node, port: portEl.dataset.port } : null;
      const changed = JSON.stringify(hp) !== JSON.stringify(ui.hoverPort);
      if (changed) {
        ui.hoverPort = hp;
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
          if (found) {
            found.item.x = doSnap(o.x + dx);
            found.item.y = doSnap(o.y + dy);
          }
        }
      });
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
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

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function isEditingText(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
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
      ui.wireDraft = null;
      store.clearSelection();
      requestRender();
      return;
    }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    if (k === 'c') setTool('wire');
    if (k === 'z') setTool('zone');
    if (k === 'n') setTool('note');
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceDown = false;
      svg.classList.remove('panning');
    }
  });

  return { view, ui, setTool, getTool: () => tool, zoomBy, zoomReset, toWorld };
}
