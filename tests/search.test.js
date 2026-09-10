import test from 'node:test';
import assert from 'node:assert/strict';
import { filterParts, partHaystack, filterTemplates, templateHaystack } from '../src/search.js';
import { PARTS } from '../src/palette.js';
import { initI18n, setLang } from '../src/i18n.js';

test('an empty query matches every part', () => {
  assert.equal(filterParts('').size, Object.keys(PARTS).length);
  assert.equal(filterParts('   ').size, Object.keys(PARTS).length);
});

test('search matches part names, categories, port buses, and vendor preset names', () => {
  assert.ok(filterParts('lidar').has('lidar'));
  assert.ok(filterParts('RDK').has('aisbc'), 'a vendor preset finds its generic part');
  assert.ok(filterParts('journey').has('autosoc') && filterParts('journey').has('adas'));
  assert.ok(filterParts('i2c').has('temp'), 'a bus name finds parts that carry it');
  assert.ok(filterParts('automotive').has('radar'), 'category names count');
  assert.equal(filterParts('zzzzqq').size, 0);
});

test('every word must match, case-insensitively', () => {
  const both = filterParts('MIPI camera');
  assert.ok(both.has('mipicam'));
  assert.ok(!both.has('lidar'));
  assert.match(partHaystack(PARTS.aisbc), /rdk x5/);
});

test('library templates match by name, category, port names, buses, and the words custom and library', () => {
  const templates = [
    { id: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' }, ports: [{ id: 'p1', name: 'CAN', side: 'left', bus: 'can', required: false }], fields: [] },
    { id: 'lp2', name: 'Fan', category: 'misc', accent: null, icon: { text: 'F' }, ports: [], fields: [] },
  ];
  assert.deepEqual(filterTemplates('motor', templates).map((t) => t.id), ['lp1']);
  assert.deepEqual(filterTemplates('can', templates).map((t) => t.id), ['lp1'], 'a bus name');
  assert.deepEqual(filterTemplates('actuators', templates).map((t) => t.id), ['lp1'], 'a category name');
  assert.deepEqual(filterTemplates('custom', templates).map((t) => t.id), ['lp1', 'lp2']);
  assert.deepEqual(filterTemplates('', templates).length, 2);
  assert.deepEqual(filterTemplates('zzz', templates), []);
  assert.match(templateHaystack(templates[0]), /motor driver x4 actuators can/);
});

test('Chinese queries match translated part, category and bus names while English still matches', () => {
  initI18n({ storage: null });
  setLang('zh');
  try {
    assert.ok(filterParts('微控制器').has('mcu'), 'part name');
    assert.ok(filterParts('计算').has('mcu'), 'category name');
    assert.ok(filterParts('以太网').has('ethphy'), 'bus name');
    assert.ok(filterParts('mcu').has('mcu'), 'English kind still matches');
    assert.ok(filterParts('temp sensor').has('temp'), 'English name still matches');
  } finally {
    setLang('en');
  }
});
