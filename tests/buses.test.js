import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSES, BUS_ORDER, DEFAULT_BUS } from '../src/buses.js';

test('BUS_ORDER matches BUSES keys exactly', () => {
  assert.deepEqual([...BUS_ORDER].sort(), Object.keys(BUSES).sort());
});

test('every bus is fully defined: a name, a short code, and whether it carries traffic', () => {
  for (const [id, b] of Object.entries(BUSES)) {
    assert.ok(typeof b.name === 'string' && b.name, `${id} name`);
    assert.ok(typeof b.short === 'string' && b.short, `${id} short`);
    assert.equal(typeof b.flows, 'boolean', `${id} flows`);
  }
  assert.equal(BUSES.gnd.flows, false, 'ground never flows');
});

test('default bus exists', () => {
  assert.ok(BUSES[DEFAULT_BUS]);
});
