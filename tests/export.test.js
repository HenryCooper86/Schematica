import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportSVG } from '../src/export.js';
import { contentBounds } from '../src/geometry.js';
import { getPart } from '../src/palette.js';
import { Store, addNode } from '../src/state.js';

function sampleDoc() {
  const store = new Store();
  addNode(store, 'mcu', 100, 100);
  return store.doc;
}

test('default export paints the canvas background; transparent omits it', () => {
  const doc = sampleDoc();
  const opaque = buildExportSVG(doc);
  const transparent = buildExportSVG(doc, { transparent: true });
  assert.ok(opaque.includes('#0a0e17'), 'background rect present by default');
  assert.ok(!transparent.includes('#0a0e17'), 'no background rect when transparent');
  assert.ok(transparent.startsWith('<svg'), 'still a standalone svg');
});

test('export dimensions are content bounds plus margins', () => {
  const doc = sampleDoc();
  const b = contentBounds(doc, getPart);
  const svg = buildExportSVG(doc);
  const w = Number(svg.match(/width="([0-9.]+)"/)[1]);
  const h = Number(svg.match(/height="([0-9.]+)"/)[1]);
  assert.equal(w, b.w + 48);
  assert.equal(h, b.h + 48);
});
