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
      { id: 'w1', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'b', port: 'i2c' }, label: '', arrow: null, style: null },
      { id: 'w2', bus: 'gnd', from: { node: 'a', port: 'gnd' }, to: { node: 'b', port: 'gnd' }, label: '', arrow: null, style: null },
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

test('wire arrowheads and style overrides render when set', () => {
  const doc = sampleDoc();
  doc.wires[0].arrow = 'fwd';
  doc.wires[0].style = 'dotted';
  const one = diagramMarkup(doc);
  assert.equal((one.match(/class="arrow"/g) || []).length, 1, 'one arrowhead for fwd');
  assert.ok(one.includes('stroke-dasharray="1.5 5"'), 'dotted style override applied');
  doc.wires[0].arrow = 'both';
  const two = diagramMarkup(doc);
  assert.equal((two.match(/class="arrow"/g) || []).length, 2, 'two arrowheads for both');
  doc.wires[0].style = 'solid';
  assert.ok(!diagramMarkup(doc).match(/w1[^]*?stroke-dasharray="1.5 5"/), 'solid override removes dots');
});

test('thermal flag pulses in its own color when bug is absent', () => {
  const doc = sampleDoc();
  doc.nodes[0].flags = ['thermal'];
  const anim = diagramMarkup(doc, { animate: true, now: 777 });
  assert.ok(anim.includes('class="pulse"'));
  assert.ok(anim.includes('#fb923c'));
});

test('wire label chips render in their own layer above the nodes', () => {
  const m = diagramMarkup(sampleDoc());
  const nodesAt = m.indexOf('class="layer-nodes"');
  const chipsAt = m.indexOf('class="layer-wire-chips"');
  assert.ok(nodesAt >= 0 && chipsAt > nodesAt, 'chip layer follows the node layer');
  assert.ok(m.slice(chipsAt).includes('data-id="w1"'), 'chip wrapper keeps the wire id');
});

test('per-wire flow overrides: off suppresses, on animates without the global toggle', () => {
  const doc = sampleDoc();
  doc.wires[0].flow = 'off';
  const anim = diagramMarkup(doc, { animate: true, now: 1234 });
  assert.ok(!anim.includes('stroke-dashoffset'), 'flow "off" wins over global animate');
  doc.wires[0].flow = 'on';
  const still = diagramMarkup(doc, { now: 1234 });
  assert.equal((still.match(/stroke-dashoffset/g) || []).length, 1, 'flow "on" animates alone');
});

test('sneakernet style renders an air gap: sparse dash, shoe chip, no flow', () => {
  const doc = sampleDoc();
  doc.wires[0].style = 'sneakernet';
  const anim = diagramMarkup(doc, { animate: true, now: 500 });
  assert.ok(anim.includes('stroke-dasharray="2 9"'), 'air-gap dash applied');
  assert.ok(!anim.includes('stroke-dashoffset'), 'nothing flows across an air gap');
  assert.ok(anim.includes('\u{1F45F} air gap'), 'unlabeled sneakernet wire chip says so');
});

test('swimlanes render a title band, lane dividers, and lane names', () => {
  const doc = sampleDoc();
  doc.zones.push({
    id: 'z9', x: 0, y: 200, w: 400, h: 300, label: 'Assembly', color: '#a78bfa',
    kind: 'swimlane', orient: 'h', lanes: ['Intake', 'QA'],
  });
  const m = diagramMarkup(doc);
  assert.ok(m.includes('class="zone swimlane"'));
  assert.ok(m.includes('>Assembly</text>'));
  assert.ok(m.includes('>Intake</text>') && m.includes('>QA</text>'));
  assert.equal((m.match(/class="lane-divider"/g) || []).length, 1, 'one divider for two lanes');
  assert.ok(m.includes('rotate(-90'), 'row-lane names read sideways in the gutter');
  assert.ok(m.includes('fill-opacity="0.05"'), 'alternating lane tint present');
  const body = m.match(/<rect [^>]*fill-opacity="0\.04"[^>]*>/)[0];
  assert.ok(body.includes('pointer-events="none"'),
    'the tinted body must not swallow clicks — marquee selection happens through it');
});

test('one LOOP_MS cycle is seamless: frame 0 equals frame LOOP_MS exactly', async () => {
  const { LOOP_MS } = await import('../src/render.js');
  const doc = sampleDoc();
  doc.nodes[1].flags = ['thermal'];
  doc.wires[1].style = 'sneakernet';
  doc.wires[1].flow = 'on';
  const f0 = diagramMarkup(doc, { animate: true, now: 0 });
  const fLoop = diagramMarkup(doc, { animate: true, now: LOOP_MS });
  assert.ok(f0.includes('stroke-dashoffset'), 'flow overlay present');
  assert.ok(f0.includes('class="footstep"'), 'footprints walking the air gap');
  assert.equal(fLoop, f0, 'every animated attribute returns to its start');
  const mid = diagramMarkup(doc, { animate: true, now: LOOP_MS / 2 });
  assert.notEqual(mid, f0, 'frames inside the loop actually move');
});

test('ports are hidden until their node is hovered', () => {
  const doc = sampleDoc();
  assert.ok(!diagramMarkup(doc).includes('class="port"'), 'no ports by default');
  const hovered = diagramMarkup(doc, { hoverNode: 'a' });
  assert.ok(hovered.includes('data-node="a"'), 'hovered node shows its ports');
  assert.ok(!hovered.includes('data-node="b"'), 'other nodes stay clean');
});

test('wire mode and an active wire draft reveal every port', () => {
  const doc = sampleDoc();
  const wireMode = diagramMarkup(doc, { tool: 'wire' });
  assert.ok(wireMode.includes('data-node="a"') && wireMode.includes('data-node="b"'));
  const drafting = diagramMarkup(doc, {
    wireDraft: { from: { node: 'a', port: 'i2c' }, cursor: { x: 0, y: 0 } },
  });
  assert.ok(drafting.includes('data-node="b"'), 'drafting shows the drop targets');
});

test('narrow nodes keep the status chip and drop trailing flags', () => {
  const doc = sampleDoc();
  doc.nodes[0].w = 70;
  doc.nodes[0].status = 'production';
  doc.nodes[0].flags = ['bug', 'thermal', 'power', 'lead', 'safety', 'eol'];
  const m = diagramMarkup(doc);
  assert.ok(m.includes('>PROD</text>'), 'status chip survives');
  assert.ok(!m.includes('>EOL</text>'), 'trailing flags drop first');
});
