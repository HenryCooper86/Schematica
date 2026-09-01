import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSES, BUS_ORDER, DEFAULT_BUS } from '../src/buses.js';

test('BUS_ORDER matches BUSES keys exactly', () => {
  assert.deepEqual([...BUS_ORDER].sort(), Object.keys(BUSES).sort());
});

test('every bus is fully defined', () => {
  for (const [id, b] of Object.entries(BUSES)) {
    assert.match(b.color, /^#[0-9a-f]{6}$/i, `${id} color`);
    assert.ok(b.width > 0, `${id} width`);
    assert.ok(typeof b.name === 'string' && b.name, `${id} name`);
    assert.ok(typeof b.short === 'string' && b.short, `${id} short`);
    assert.ok(b.dash === null || typeof b.dash === 'string', `${id} dash`);
  }
});

test('default bus exists', () => {
  assert.ok(BUSES[DEFAULT_BUS]);
});
