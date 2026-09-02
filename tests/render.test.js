import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramMarkup } from '../src/render.js';

const node = (id, kind, x, y, extra = {}) => ({
  id, kind, x, y, w: 160, h: 100, label: id, sublabel: '', color: null,
  addr: '', rail: '', notes: '', status: null, flags: [], ...extra,
});

function sampleDoc() {
  return {
    schema: 1,
    title: 'T',
    nodes: [
      node('a', 'mcu', 0, 0, { flags: ['bug'] }),
      node('b', 'temp', 400, 0, { status: 'deprecated' }),
    ],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'b', port: 'i2c' }, label: '' },
      { id: 'w2', bus: 'gnd', from: { node: 'a', port: 'gnd' }, to: { node: 'b', port: 'gnd' }, label: '' },
    ],
    zones: [],
    notes: [],
    journey: [],
  };
}

test('static markup has no animation artifacts', () => {
  const still = diagramMarkup(sampleDoc());
  assert.ok(!still.includes('stroke-dashoffset'), 'no flow overlays when not animating');
  assert.ok(!still.includes('class="pulse"'), 'no pulse rings when not animating');
});

test('animated markup adds flow overlays for flowing buses but not gnd', () => {
  const anim = diagramMarkup(sampleDoc(), { animate: true, now: 1234 });
  const overlays = (anim.match(/stroke-dashoffset/g) || []).length;
  assert.equal(overlays, 1, 'i2c flows, gnd does not');
});

test('flow overlays actually move over time', () => {
  const a = diagramMarkup(sampleDoc(), { animate: true, now: 1000 });
  const b = diagramMarkup(sampleDoc(), { animate: true, now: 1400 });
  const off = (s) => s.match(/stroke-dashoffset="([-0-9.]+)"/)[1];
  assert.notEqual(off(a), off(b));
});

test('bug flag pulses when animating; deprecated badge blinks', () => {
  const anim = diagramMarkup(sampleDoc(), { animate: true, now: 777 });
  assert.ok(anim.includes('class="pulse"'), 'bug-flagged node gets a pulse ring');
  assert.ok(anim.includes('#f87171'), 'pulse ring uses the bug color');
  const blinkA = diagramMarkup(sampleDoc(), { animate: true, now: 200 });
  const blinkB = diagramMarkup(sampleDoc(), { animate: true, now: 900 });
  const chipOp = (s) => s.match(/class="blink" opacity="([0-9.]+)"/)?.[1];
  assert.ok(chipOp(blinkA) !== undefined, 'deprecated chip carries a blink opacity');
  assert.notEqual(chipOp(blinkA), chipOp(blinkB), 'blink opacity oscillates');
});

test('thermal flag pulses in its own color when bug is absent', () => {
  const doc = sampleDoc();
  doc.nodes[0].flags = ['thermal'];
  const anim = diagramMarkup(doc, { animate: true, now: 777 });
  assert.ok(anim.includes('class="pulse"'));
  assert.ok(anim.includes('#fb923c'));
});
