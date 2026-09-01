import { uid } from './state.js';

export function addStep(store, view, label) {
  const id = uid('j');
  store.apply((doc) => {
    if (!doc.journey) doc.journey = [];
    doc.journey.push({
      id,
      label: label || `Step ${doc.journey.length + 1}`,
      view: { x: view.x, y: view.y, zoom: view.zoom },
      caption: '',
    });
  });
  return id;
}

export function updateStep(store, id, props) {
  store.apply((doc) => {
    const step = (doc.journey || []).find((s) => s.id === id);
    if (!step) return;
    if (props.view) step.view = { x: props.view.x, y: props.view.y, zoom: props.view.zoom };
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
