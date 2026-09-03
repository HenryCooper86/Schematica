import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportSVG } from '../src/export.js';
import { contentBounds } from '../src/geometry.js';
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
  const b = contentBounds(doc);
  const svg = buildExportSVG(doc);
  const w = Number(svg.match(/width="([0-9.]+)"/)[1]);
  const h = Number(svg.match(/height="([0-9.]+)"/)[1]);
  assert.equal(w, b.w + 48);
  assert.equal(h, b.h + 48);
});

test('export embeds the defs and leaves the editor-only ports out', () => {
  const svg = buildExportSVG(sampleDoc());
  assert.ok(svg.includes('<marker id="arrow"'), 'arrow marker travels with the file');
  assert.ok(svg.includes('id="cardGrad"') && svg.includes('id="nodeShadow"'));
  assert.ok(!svg.includes('class="ports"'), 'hover-only port dots are not exported');
});

test('buildExportSVG renders an animation frame when given a timestamp', () => {
  const doc = {
    schema: 1,
    title: 'T',
    nodes: [
      { id: 'a', kind: 'mcu', x: 0, y: 0, label: 'a', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
      { id: 'b', kind: 'temp', x: 400, y: 0, label: 'b', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
    ],
    wires: [{ id: 'w1', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'b', port: 'i2c' }, label: '', arrow: null, style: null, flow: null }],
    zones: [],
    notes: [],
    journey: [],
  };
  assert.ok(!buildExportSVG(doc).includes('stroke-dashoffset'), 'static export has no animation');
  assert.ok(buildExportSVG(doc, { now: 500 }).includes('stroke-dashoffset'), 'timestamped export freezes the flow frame');
});
