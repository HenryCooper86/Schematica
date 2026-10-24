// The canvas slides a selected card out from under the floating panels. A
// panel the user dragged is position:fixed, which leaves offsetParent null
// while it is plainly on screen, so visibility is read from client rects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initKeepClear } from '../src/ui/keep-clear.js';

function stubBrowser(t, { assistant }) {
  const descriptors = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'performance']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const elements = {
    'canvas-wrap': { getBoundingClientRect: () => rect(0, 0, 1200, 800) },
    assistant: {
      hidden: false,
      // Dragged panels are position:fixed: no offsetParent, still on screen.
      offsetParent: null,
      getClientRects: () => (assistant.onScreen ? [rect(500, 0, 300, 600)] : []),
      getBoundingClientRect: () => (assistant.onScreen ? rect(500, 0, 300, 600) : rect(0, 0, 0, 0)),
    },
  };
  const define = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
  define('document', { getElementById: (id) => elements[id] || null, hidden: false });
  define('window', { addEventListener() {}, matchMedia: () => ({ matches: true }) });
  define('requestAnimationFrame', (cb) => { cb(0); return 1; });
  define('cancelAnimationFrame', () => {});
  define('CSS', { escape: (s) => s });
  define('performance', { now: () => 0 });
  const card = { getBoundingClientRect: () => rect(520, 100, 104, 74) };
  const svg = { addEventListener() {}, querySelector: () => card };
  let listener = null;
  const store = { selection: new Set(['n1']), subscribe: (cb) => { listener = cb; } };
  const tools = { view: { x: 0, y: 0, zoom: 1 } };
  const renders = [];
  initKeepClear({ svg, store, tools, render: (kind) => renders.push(kind) });
  return { select: () => listener('selection'), tools, renders };
}

test('a dragged (position:fixed) panel still pushes the selected card clear', (t) => {
  const { select, tools, renders } = stubBrowser(t, { assistant: { onScreen: true } });
  select();
  assert.equal(tools.view.x, 500 - 16 - 624, 'the view slides the card to a gap left of the panel');
  assert.deepEqual(renders, ['view']);
});

test('a panel with no client rects is not on screen and moves nothing', (t) => {
  const { select, tools, renders } = stubBrowser(t, { assistant: { onScreen: false } });
  select();
  assert.equal(tools.view.x, 0);
  assert.deepEqual(renders, []);
});
