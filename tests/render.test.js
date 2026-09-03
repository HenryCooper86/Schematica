import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramMarkup, defsMarkup, flowOffset, LOOP_MS } from '../src/render.js';

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

// The markup of one wire group (no nested groups live inside a wire).
function wireGroup(markup, id) {
  const at = markup.indexOf(`data-id="${id}"`);
  assert.ok(at >= 0, `wire ${id} rendered`);
  return markup.slice(markup.lastIndexOf('<g class="wire', at), markup.indexOf('</g>', at));
}

const visPath = (group) => group.match(/<path class="vis[^"]*"[^>]*>/)[0];

test('static markup has no animation artifacts', () => {
  const still = diagramMarkup(sampleDoc());
  assert.ok(!still.includes('stroke-dashoffset'), 'no baked flow offsets when not animating');
  assert.ok(!still.includes('class="vis anim"'), 'no flowing wires when not animating');
  assert.ok(!still.includes('class="fxhalo"'), 'no pulse halos when not animating');
});

test('wires are net_draw edges: one 2px slate stroke, round caps, 14px hit area', () => {
  const g = wireGroup(diagramMarkup(sampleDoc()), 'w1');
  assert.ok(g.includes('stroke="transparent" stroke-width="14"'), 'wide invisible hit path');
  const vis = visPath(g);
  assert.ok(vis.includes('stroke="#526180"'), 'slate stroke regardless of bus');
  assert.ok(vis.includes('stroke-width="2"'));
  assert.ok(vis.includes('stroke-linecap="round"'));
  assert.ok(!g.includes('#38bdf8'), 'the I2C bus color never reaches the canvas');
  assert.ok(!g.includes('stroke-dasharray'), 'default style is solid');
});

test('a selected wire turns sky blue and slightly heavier', () => {
  const m = diagramMarkup(sampleDoc(), { selection: new Set(['w1']) });
  const sel = wireGroup(m, 'w1');
  assert.ok(sel.startsWith('<g class="wire sel"'));
  assert.ok(visPath(sel).includes('stroke="#7dd3fc"') && visPath(sel).includes('stroke-width="2.4"'));
  assert.ok(visPath(wireGroup(m, 'w2')).includes('stroke="#526180"'), 'others stay slate');
  assert.ok(!m.includes('stroke-opacity="0.3"'), 'no translucent glow halo');
});

test('wire ends anchor on the facing card edges', () => {
  const doc = sampleDoc();
  doc.wires.pop();
  const d = visPath(wireGroup(diagramMarkup(doc), 'w1')).match(/ d="([^"]+)"/)[1];
  assert.equal(d, 'M 165 50 C 257 50, 303 50, 395 50');
});

test('parallel wires between the same pair fan out instead of overlapping', () => {
  const m = diagramMarkup(sampleDoc());
  const d1 = visPath(wireGroup(m, 'w1')).match(/ d="([^"]+)"/)[1];
  const d2 = visPath(wireGroup(m, 'w2')).match(/ d="([^"]+)"/)[1];
  assert.notEqual(d1, d2);
  assert.ok(d1.startsWith('M 165 39 '), 'first wire runs half a fan above center');
  assert.ok(d2.startsWith('M 165 61 '), 'second wire runs half a fan below center');
});

test('wire label is a neutral pill inside the wire group; blank label shows the bus code', () => {
  const m = diagramMarkup(sampleDoc());
  assert.ok(!m.includes('layer-wire-chips'), 'no separate chip layer');
  const g = wireGroup(m, 'w1');
  assert.ok(g.includes('fill="#0c1424" stroke="#24304d" stroke-width="1"'), 'net_draw pill');
  assert.ok(g.includes('font-size="10.5" fill="#8fa3c0"'), 'net_draw label text');
  assert.ok(g.includes('data-edit="label">I2C</text>'), 'bus short code by default');
  const doc = sampleDoc();
  doc.wires[0].label = '3V3 rail';
  assert.ok(wireGroup(diagramMarkup(doc), 'w1').includes('>3V3 rail</text>'));
});

test('arrowheads use the shared marker so they follow the stroke color', () => {
  const doc = sampleDoc();
  doc.wires[0].arrow = 'fwd';
  const one = visPath(wireGroup(diagramMarkup(doc), 'w1'));
  assert.ok(one.includes('marker-end="url(#arrow)"'));
  assert.ok(!one.includes('marker-start'));
  doc.wires[0].arrow = 'both';
  const two = visPath(wireGroup(diagramMarkup(doc), 'w1'));
  assert.ok(two.includes('marker-end="url(#arrow)"') && two.includes('marker-start="url(#arrow)"'));
});

test('line styles map to the net_draw dash patterns', () => {
  const doc = sampleDoc();
  const dashOf = (style) => {
    doc.wires[0].style = style;
    return visPath(wireGroup(diagramMarkup(doc), 'w1')).match(/stroke-dasharray="([^"]+)"/)?.[1] ?? null;
  };
  assert.equal(dashOf('dashed'), '8 6');
  assert.equal(dashOf('dotted'), '2 5');
  assert.equal(dashOf('sneakernet'), '1 9');
  assert.equal(dashOf('solid'), null);
  assert.equal(dashOf(null), null);
});

test('animated wires flow with the 6 8 dash and a baked offset; ground never flows', () => {
  const anim = diagramMarkup(sampleDoc(), { animate: true, now: 1234 });
  const i2c = visPath(wireGroup(anim, 'w1'));
  assert.ok(i2c.includes('class="vis anim"') && i2c.includes('stroke-dasharray="6 8"'));
  assert.ok(i2c.includes('stroke-dashoffset='), 'export frames carry the offset as an attribute');
  const gnd = visPath(wireGroup(anim, 'w2'));
  assert.ok(!gnd.includes('anim') && !gnd.includes('stroke-dashoffset'), 'ground does not flow');
  assert.ok(!anim.includes('stroke-opacity="0.55"'), 'no white dotted overlay path');
  const live = diagramMarkup(sampleDoc(), { animate: true });
  assert.ok(live.includes('class="vis anim"'), 'live markup flags flowing wires for the CSS animation');
  assert.ok(!live.includes('stroke-dashoffset'), 'live markup bakes nothing; CSS drives the motion');
});

test('flow offset moves over time and returns to zero after one loop', () => {
  assert.equal(flowOffset(0), 0);
  assert.equal(flowOffset(LOOP_MS), 0);
  assert.notEqual(flowOffset(1000), flowOffset(1400));
  const a = diagramMarkup(sampleDoc(), { animate: true, now: 1000 });
  const b = diagramMarkup(sampleDoc(), { animate: true, now: 1400 });
  const off = (s) => s.match(/stroke-dashoffset="([-0-9.]+)"/)[1];
  assert.notEqual(off(a), off(b));
});

test('per-wire flow overrides: off suppresses, on animates without the global toggle', () => {
  const doc = sampleDoc();
  doc.wires[0].flow = 'off';
  const anim = diagramMarkup(doc, { animate: true, now: 1234 });
  assert.ok(!anim.includes('stroke-dashoffset') && !anim.includes('vis anim'), 'flow "off" wins over global animate');
  doc.wires[0].flow = 'on';
  const still = diagramMarkup(doc, { now: 1234 });
  assert.equal((still.match(/stroke-dashoffset/g) || []).length, 1, 'flow "on" animates alone');
});

test('flags pulse as a net_draw halo around the card when animating', () => {
  const anim = diagramMarkup(sampleDoc(), { animate: true, now: 777 });
  const halo = anim.match(/<rect class="fxhalo"[^>]*>/)[0];
  assert.ok(halo.includes('stroke="#f87171"'), 'bug color');
  assert.ok(halo.includes('stroke-width="2.2"') && halo.includes('rx="17"'));
  assert.ok(halo.includes('x="-4" y="-4" width="168" height="108"'), 'hugs the card by 4px');
  assert.ok(/stroke-opacity="0\.\d+"/.test(halo), 'export frames bake the pulse opacity');
  const blinkA = diagramMarkup(sampleDoc(), { animate: true, now: 200 });
  const blinkB = diagramMarkup(sampleDoc(), { animate: true, now: 900 });
  const chipOp = (s) => s.match(/class="blink" opacity="([0-9.]+)"/)?.[1];
  assert.ok(chipOp(blinkA) !== undefined, 'deprecated chip carries a blink opacity');
  assert.notEqual(chipOp(blinkA), chipOp(blinkB), 'blink opacity oscillates');
  const doc = sampleDoc();
  doc.nodes[0].flags = ['thermal'];
  assert.ok(diagramMarkup(doc, { animate: true, now: 777 }).includes('class="fxhalo" x="-4" y="-4" width="168" height="108" rx="17" fill="none" stroke="#fb923c"'));
});

test('sneakernet style renders an air gap: sparse dash, shoe chip, footprints, no flow', () => {
  const doc = sampleDoc();
  doc.wires[0].style = 'sneakernet';
  const anim = diagramMarkup(doc, { animate: true, now: 500 });
  const g = wireGroup(anim, 'w1');
  assert.ok(visPath(g).includes('stroke-dasharray="1 9"'), 'air-gap dash applied');
  assert.ok(!g.includes('stroke-dashoffset') && !g.includes('vis anim'), 'nothing flows across an air gap');
  assert.ok(g.includes('\u{1F45F} air gap'), 'unlabeled sneakernet wire chip says so');
  assert.equal((g.match(/class="footstep"/g) || []).length, 3, 'footprints walk the path');
  assert.ok(g.includes('data-g="'), 'the wire carries its curve so the live ticker can move the footprints');
});

test('one LOOP_MS cycle is seamless: frame 0 equals frame LOOP_MS exactly', () => {
  const doc = sampleDoc();
  doc.nodes[1].flags = ['thermal'];
  doc.wires[1].style = 'sneakernet';
  doc.wires[1].flow = 'on';
  const f0 = diagramMarkup(doc, { animate: true, now: 0 });
  const fLoop = diagramMarkup(doc, { animate: true, now: LOOP_MS });
  assert.ok(f0.includes('stroke-dashoffset'), 'flow offset present');
  assert.ok(f0.includes('class="footstep"'), 'footprints walking the air gap');
  assert.equal(fLoop, f0, 'every animated attribute returns to its start');
  const mid = diagramMarkup(doc, { animate: true, now: LOOP_MS / 2 });
  assert.notEqual(mid, f0, 'frames inside the loop actually move');
});

test('ports render for every node in a ports group that CSS reveals on hover', () => {
  const m = diagramMarkup(sampleDoc());
  assert.equal((m.match(/<g class="ports">/g) || []).length, 2, 'one ports group per node');
  const port = m.match(/<g class="portg" data-node="a" data-port="i2c">[^]*?<\/g>/)[0];
  assert.ok(port.includes('<circle class="port" cx="160" cy="20" r="5" fill="#0d1526"'), 'net_draw port dot');
  assert.ok(port.includes('stroke-width="1.6"'));
  assert.ok(port.includes('class="port-name"') && port.includes('I2C · I2C'), 'pin name shown on hover');
  assert.ok(!diagramMarkup(sampleDoc(), { ports: false }).includes('class="ports"'), 'exports omit ports');
});

test('node cards use the net_draw surface: gradient, shadow, hairline border, selection ring', () => {
  const m = diagramMarkup(sampleDoc());
  assert.ok(m.includes('rx="14" fill="url(#cardGrad)" stroke="rgba(148,163,184,0.2)" stroke-width="1" filter="url(#nodeShadow)"'));
  const sel = diagramMarkup(sampleDoc(), { selection: new Set(['a']) });
  assert.ok(sel.includes('fill="url(#cardGrad)" stroke="#818cf8" stroke-width="1.6"'), 'selected card strokes in its accent');
  assert.ok(sel.includes('x="-5" y="-5" width="170" height="110" rx="18" fill="none" stroke="#818cf8" stroke-opacity="0.4" stroke-width="1.6"'), 'outer ring');
});

test('defsMarkup provides the grid, card gradient, shadow, and arrow marker', () => {
  const d = defsMarkup();
  for (const id of ['gridpat', 'cardGrad', 'nodeShadow']) assert.ok(d.includes(`id="${id}"`), id);
  assert.ok(d.includes('<marker id="arrow"') && d.includes('fill="context-stroke"') && d.includes('orient="auto-start-reverse"'));
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

test('narrow nodes keep the status chip and drop trailing flags', () => {
  const doc = sampleDoc();
  doc.nodes[0].w = 70;
  doc.nodes[0].status = 'production';
  doc.nodes[0].flags = ['bug', 'thermal', 'power', 'lead', 'safety', 'eol'];
  const m = diagramMarkup(doc);
  assert.ok(m.includes('>PROD</text>'), 'status chip survives');
  assert.ok(!m.includes('>EOL</text>'), 'trailing flags drop first');
});
