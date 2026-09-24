import { curvePoint } from './geometry.js';

// ---- Animation timing ----
// Live motion is CSS (see style.css); these functions bake the same state
// into attributes for export frames and recorded video. Every period divides
// LOOP_MS, so a LOOP_MS cycle returns each attribute to its exact start —
// that is what makes the seamless-loop GIF seamless.
export const LOOP_MS = 6000;
const FLOW_PERIOD_MS = 750;
const FLOW_CYCLE = 28;
const PULSE_MS = 1500;
const FOOTSTEP_MS = 2000;

export function flowOffset(nowMs) {
  return -Math.round(((nowMs / FLOW_PERIOD_MS) % 1) * FLOW_CYCLE * 100) / 100 + 0;
}

export function pulseOpacity(nowMs) {
  return (0.22 + 0.63 * (0.5 - 0.5 * Math.cos((2 * Math.PI * nowMs) / PULSE_MS))).toFixed(3);
}

export function blinkOpacity(nowMs) {
  return (0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * nowMs) / PULSE_MS))).toFixed(3);
}

export function footstepPoint(geo, nowMs, j) {
  const walk = (nowMs % FOOTSTEP_MS) / FOOTSTEP_MS;
  const p = curvePoint(geo, (walk + j / 3) % 1);
  return { x: p.x, y: Math.round((p.y + 3.5) * 100) / 100 };
}

function parseGeo(s) {
  const n = s.split(',').map(Number);
  return {
    p1: { x: n[0], y: n[1] }, c1: { x: n[2], y: n[3] }, c2: { x: n[4], y: n[5] }, p2: { x: n[6], y: n[7] },
  };
}

// Move the air-gap footprints along their wires (the one animation CSS
// cannot express); the live ticker calls this while a sneakernet wire flows.
export function stepFootsteps(root, nowMs) {
  for (const g of root.querySelectorAll('.wire[data-g]')) {
    const geo = parseGeo(g.getAttribute('data-g'));
    g.querySelectorAll('.footstep').forEach((el, j) => {
      const p = footstepPoint(geo, nowMs, j);
      el.setAttribute('x', p.x);
      el.setAttribute('y', p.y);
    });
  }
}

// Freeze a cloned canvas at time `nowMs` for rasterizing: editor-only port
// dots go, and every CSS-animated value becomes a plain attribute.
export function bakeFrame(root, nowMs) {
  root.querySelectorAll('.ports').forEach((el) => el.remove());
  root.querySelectorAll('.explore-muted, .story-muted').forEach(el => el.setAttribute('opacity', '0.2'));
  root.querySelectorAll('.wire.explore-match:not(.invalid) .vis, .wire.story-match:not(.invalid) .vis').forEach(el => { el.setAttribute('stroke', '#38bdf8'); el.setAttribute('stroke-width', '3'); });
  root.querySelectorAll('.node.story-current .card').forEach(el => el.setAttribute('stroke-width', '3'));
  root.querySelectorAll('.node.explore-match .card, .node.story-match .card').forEach(el => el.setAttribute('stroke', '#38bdf8'));
  root.querySelectorAll('[data-depth="overview"] .node:not([data-reading-focus]) [data-detail], [data-depth="overview"] .wire:not([data-reading-focus]) [data-detail], [data-depth="normal"] .node:not([data-reading-focus]) [data-detail="fine"]').forEach(el => el.setAttribute('visibility', 'hidden'));
  const off = flowOffset(nowMs);
  root.querySelectorAll('.vis.anim').forEach((el) => el.setAttribute('stroke-dashoffset', off));
  const halo = pulseOpacity(nowMs);
  root.querySelectorAll('.fxhalo.anim').forEach((el) => el.setAttribute('stroke-opacity', halo));
  const blink = blinkOpacity(nowMs);
  root.querySelectorAll('.blink').forEach((el) => el.setAttribute('opacity', blink));
  stepFootsteps(root, nowMs);
}
