import { nodeRect } from './geometry.js';
import { uid } from './state.js';
import { BUSES } from './buses.js';
import { tr } from './i18n.js';

// Step views are stored as WORLD-SPACE centers ({cx, cy, zoom}) so a journey
// frames the same content on any screen size, panel state, or present mode.
export function addStep(store, view, label) {
  const id = uid('j');
  store.apply((doc) => {
    if (!doc.journey) doc.journey = [];
    doc.journey.push({
      id,
      label: label || tr('Step {n}', { n: doc.journey.length + 1 }),
      view: { cx: view.cx, cy: view.cy, zoom: view.zoom },
      caption: '',
    });
  });
  return id;
}

export function updateStep(store, id, props) {
  store.apply((doc) => {
    const step = (doc.journey || []).find((s) => s.id === id);
    if (!step) return;
    if (props.view) step.view = { cx: props.view.cx, cy: props.view.cy, zoom: props.view.zoom };
    if (props.targets !== undefined) {
      const targets = normalizeTargets(props.targets);
      if (targets) step.targets = targets; else delete step.targets;
    }
    if (props.stops !== undefined) {
      const stops = normalizeStops(props.stops);
      if (stops.length) step.stops = stops; else delete step.stops;
    }
    if (props.label !== undefined) step.label = props.label;
    if (props.caption !== undefined) step.caption = props.caption;
  });
}

export function removeStep(store, id) {
  store.apply((doc) => {
    doc.journey = (doc.journey || []).filter((s) => s.id !== id);
  });
}

export function moveStep(store, id, delta) {
  store.apply((doc) => {
    const arr = doc.journey || [];
    const i = arr.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const [step] = arr.splice(i, 1);
    arr.splice(j, 0, step);
  });
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function tweenView(from, to, t) {
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    zoom: from.zoom + (to.zoom - from.zoom) * e,
  };
}

// Additive optional targets keep legacy camera-only steps readable. Retain
// missing IDs so deletion is visible and undo can restore the original tour.
export function normalizeTargets(value) {
  if (!value || typeof value !== 'object') return null;
  const clean = (ids) => Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id.length && id.length <= 200))].slice(0, 500) : [];
  const targets = { nodes: clean(value.nodes), wires: clean(value.wires) };
  return targets.nodes.length || targets.wires.length ? targets : null;
}

export function selectedTargets(doc, selection) {
  return normalizeTargets({ nodes: doc.nodes.filter(n => selection.has(n.id)).map(n => n.id),
    wires: doc.wires.filter(w => selection.has(w.id)).map(w => w.id) });
}

export function resolveStep(doc, step, viewport = { width: 1000, height: 700 }) {
  const targets = normalizeTargets(step.targets) || normalizeTargets({ nodes: (step.stops || []).map(s => s.node) });
  const ids = new Set();
  const nodes = new Map(doc.nodes.map(n => [n.id, n]));
  const wires = new Map(doc.wires.map(w => [w.id, w]));
  let missing = 0;
  for (const id of targets?.nodes || []) {
    if (nodes.has(id)) ids.add(id); else missing++;
  }
  for (const id of targets?.wires || []) {
    const wire = wires.get(id);
    if (!wire || !nodes.has(wire.from.node) || !nodes.has(wire.to.node)) { missing++; continue; }
    ids.add(id); ids.add(wire.from.node); ids.add(wire.to.node);
  }
  const rects = [...ids].filter(id => nodes.has(id)).map(id => nodeRect(nodes.get(id)));
  if (!rects.length) return { view: { ...step.view }, ids, missing };
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  const w = Math.max(...rects.map(r => r.x + r.w)) - x;
  const h = Math.max(...rects.map(r => r.y + r.h)) - y;
  const zoom = Math.max(0.2, Math.min(1.5, (viewport.width - 120) / Math.max(1, w), (viewport.height - 160) / Math.max(1, h)));
  return { view: { cx: x + w / 2, cy: y + h / 2, zoom }, ids, missing };
}

// Stable stop IDs make exact presentation links survive stop reordering.
export function normalizeStops(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(s => {
    if (!s || typeof s.id !== 'string' || !s.id.length || s.id.length > 200 || seen.has(s.id)
      || typeof s.node !== 'string' || !s.node.length || s.node.length > 200) return false;
    seen.add(s.id); return true;
  }).slice(0, 100).map(s => ({ id: s.id, node: s.node, caption: typeof s.caption === 'string' ? s.caption.slice(0, 4000) : '' }));
}

export function addStops(store, chapterId, selection) {
  const chapter = store.doc.journey?.find(s => s.id === chapterId);
  if (!chapter) return;
  const nodes = new Set(store.doc.nodes.map(n => n.id));
  const stops = [...(chapter.stops || [])];
  for (const id of selection) if (nodes.has(id)) stops.push({ id: uid('beat'), node: id, caption: '' });
  updateStep(store, chapterId, { stops });
}

// -1 is the chapter overview; stops are visited in explicitly authored order.
export function nextStoryPosition(steps, chapter, stop, delta) {
  if (!steps.length) return null;
  if (delta > 0) {
    if (stop + 1 < (steps[chapter]?.stops?.length || 0)) return { chapter, stop: stop + 1 };
    if (chapter + 1 < steps.length) return { chapter: chapter + 1, stop: -1 };
  } else {
    if (stop >= 0) return { chapter, stop: stop - 1 };
    if (chapter > 0) return { chapter: chapter - 1, stop: (steps[chapter - 1].stops?.length || 0) - 1 };
  }
  return null;
}

export function resolveStoryStop(doc, step, index, viewport) {
  const stop = step.stops?.[index];
  if (!stop) return resolveStep(doc, step, viewport);
  const relationship = storyRelationship(doc, step, index);
  return resolveStep(doc, { ...step, targets: { nodes: [stop.node], wires: relationship.wires.map(w => w.id) } }, viewport);
}

// Diagram order and electrical direction are independent. Only direct authored
// wires are included; multiple connections and unspecified arrows stay explicit.
export function storyRelationship(doc, step, index) {
  const current = step.stops?.[index]?.node, previous = step.stops?.[index - 1]?.node;
  const nodes = new Map(doc.nodes.map(n => [n.id, n]));
  if (!current || !nodes.has(current)) return { kind: 'missing', wires: [] };
  if (!previous) return { kind: 'start', wires: [] };
  if (!nodes.has(previous)) return { kind: 'missing', wires: [] };
  if (previous === current) return { kind: 'same', wires: [] };
  const wires = doc.wires.filter(w => (w.from.node === previous && w.to.node === current)
    || (w.to.node === previous && w.from.node === current));
  return { kind: wires.length ? 'connected' : 'unconnected', wires };
}

export function storyRelationshipText(doc, step, index) {
  const relation = storyRelationship(doc, step, index);
  if (relation.kind === 'start') return tr('Starting part');
  if (relation.kind === 'missing') return tr('Missing part');
  if (relation.kind === 'same') return tr('Same part; another explanation');
  if (relation.kind === 'unconnected') return tr('No direct wire between these stops');
  const endpoint = p => `${doc.nodes.find(n => n.id === p.node)?.label || p.node} · ${p.port}`;
  return relation.wires.map(w => {
    const arrow = w.arrow === 'both' ? '↔' : w.arrow === 'fwd' ? '→' : '—';
    const direction = w.arrow === 'both' ? tr('Bidirectional arrow') : w.arrow === 'fwd' ? tr('Authored arrow direction') : tr('Direction unspecified');
    return `${endpoint(w.from)} ${arrow} ${endpoint(w.to)} · ${BUSES[w.bus]?.short || w.bus}${w.label ? ' · ' + w.label : ''} · ${direction}`;
  }).join('\n');
}

export function readStoryMoment(steps, params) {
  const chapter = steps.findIndex(s => s.id === params.get('step'));
  if (chapter < 0) return null;
  const stop = (steps[chapter].stops || []).findIndex(s => s.id === params.get('stop'));
  return { chapter, stop };
}
