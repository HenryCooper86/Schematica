import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionFocus, searchBoard, readingDepth, nodeHaystack } from '../src/explore.js';
import { newDoc } from '../src/state.js';
import { buildExportSVG } from '../src/export.js';
import { diagramMarkup } from '../src/render.js';
import { initI18n, setLang } from '../src/i18n.js';

function fixture() {
  const doc = newDoc();
  doc.nodes = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, kind: 'mcu', label: id, x: i * 200, y: 0,
    sublabel: '', addr: '', rail: '', notes: '', flags: [] }));
  const wire = (id, a, b, bus) => ({ id, from: { node: a, port: 'i2c' }, to: { node: b, port: 'i2c' }, bus });
  doc.wires = [wire('ab', 'a', 'b', 'i2c'), wire('ba', 'b', 'a', 'i2c'), wire('cb', 'c', 'b', 'i2c'),
    wire('ac', 'a', 'c', 'power'), wire('dd', 'd', 'd', 'i2c'), wire('missing', 'e', 'absent', 'i2c')];
  return doc;
}
const sorted = (set) => [...set].sort();

test('network traverses drawn wires in either endpoint order, handles cycles, parallel wires, and dangling endpoints', () => {
  const doc = fixture();
  const before = JSON.stringify(doc);
  const focus = connectionFocus(doc, { bus: 'i2c', connections: 'network' }, new Set(['a']));
  assert.deepEqual(sorted(focus.nodes), ['a', 'b', 'c']);
  assert.deepEqual(sorted(focus.wires), ['ab', 'ba', 'cb']);
  assert.equal(JSON.stringify(doc), before);
});

test('immediate neighbors do not include transitive wires and bus filter intersects connections', () => {
  const focus = connectionFocus(fixture(), { bus: 'i2c', connections: 'neighbors' }, new Set(['a']));
  assert.deepEqual(sorted(focus.nodes), ['a', 'b']);
  assert.deepEqual(sorted(focus.wires), ['ab', 'ba']);
});

test('filter alone includes only eligible endpoints; an absent bus yields zero matches', () => {
  const doc = fixture();
  assert.deepEqual(sorted(connectionFocus(doc, { bus: 'power' }).nodes), ['a', 'c']);
  assert.equal(connectionFocus(doc, { bus: 'can' }).nodes.size, 0);
  assert.equal(connectionFocus(doc, { bus: 'can' }).active, true);
});

test('isolated selections remain visible, multi-selection combines seeds, and non-node selection never becomes a seed', () => {
  const doc = fixture();
  assert.deepEqual(sorted(connectionFocus(doc, { connections: 'network' }, new Set(['e'])).nodes), ['e']);
  assert.deepEqual(sorted(connectionFocus(doc, { connections: 'network' }, new Set(['a', 'd'])).nodes), ['a', 'b', 'c', 'd']);
  assert.equal(connectionFocus(doc, { connections: 'network' }, new Set(['ab', 'deleted'])).active, false);
});

test('search uses actual board labels, part numbers, metadata and bus names with all-word matching', () => {
  const doc = fixture();
  Object.assign(doc.nodes[0], { label: '车载 Controller', sublabel: 'ESP32-S3', addr: '0x76', rail: '3.3V', fields: { dns: 'edge.local' } });
  for (const query of ['车载 esp32', 'controller 0X76', 'edge.local', '3.3V']) {
    assert.deepEqual(searchBoard(doc, query).map((n) => n.id), ['a']);
  }
  assert.equal(searchBoard(doc, 'I2C').length, 5);
  assert.equal(searchBoard(doc, 'esp32 nonexistent').length, 0);
  assert.equal(searchBoard(doc, '').length, 5);
});

test('reading depth thresholds and explicit overrides are deterministic', () => {
  assert.equal(readingDepth('auto', 0.64), 'overview');
  assert.equal(readingDepth('auto', 0.65), 'normal');
  assert.equal(readingDepth('auto', 1.25), 'full');
  assert.equal(readingDepth('full', 0.2), 'full');
  assert.equal(readingDepth('overview', 4), 'overview');
});

test('canonical export retains metadata and is free of exploration state', () => {
  const doc = fixture();
  doc.nodes[0].sublabel = 'ESP32-S3'; doc.nodes[0].rail = '3.3V';
  const markup = diagramMarkup(doc);
  assert.match(markup, /data-detail="context"/);
  assert.match(markup, /data-detail="fine"/);
  const svg = buildExportSVG(doc);
  assert.match(svg, /ESP32-S3/);
  assert.match(svg, /3.3V/);
  assert.doesNotMatch(svg, /explore-muted|explore-match|data-depth|visibility="hidden"/);
});

test('a Chinese query matches the translated category name of a board part', () => {
  initI18n({ storage: null });
  const doc = fixture();
  assert.equal(searchBoard(doc, '计算').length, 0, 'English keeps English names');
  assert.equal(searchBoard(doc, 'compute').length, 5, 'the category id still matches');
  setLang('zh');
  try {
    assert.equal(searchBoard(doc, '计算').length, 5, 'the MCU category name is translated');
    assert.equal(searchBoard(doc, '微控制器').length, 5, 'the part name is translated');
    assert.equal(searchBoard(doc, 'compute').length, 5, 'the category id still matches');
    assert.deepEqual(nodeHaystack(doc.nodes[0]).includes('计算'), true);
  } finally {
    setLang('en');
  }
});
