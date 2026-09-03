import test from 'node:test';
import assert from 'node:assert/strict';
import { filterParts, partHaystack } from '../src/search.js';
import { PARTS } from '../src/palette.js';

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
