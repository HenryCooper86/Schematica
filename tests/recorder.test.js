import test from 'node:test';
import assert from 'node:assert/strict';
import { fitRect } from '../src/recorder.js';

test('fitRect letterboxes into the destination, centered', () => {
  assert.deepEqual(fitRect(200, 100, 100, 100), { x: 50, y: 0, w: 100, h: 100 });
  assert.deepEqual(fitRect(100, 100, 50, 25), { x: 0, y: 25, w: 100, h: 50 });
  assert.deepEqual(fitRect(100, 100, 100, 100), { x: 0, y: 0, w: 100, h: 100 });
});

test('fitRect preserves the source aspect ratio', () => {
  const box = fitRect(1920, 1080, 1234, 777);
  assert.ok(Math.abs(box.w / box.h - 1234 / 777) < 1e-9);
  assert.ok(box.w <= 1920 && box.h <= 1080);
});

test('fitRect returns null for degenerate sizes', () => {
  assert.equal(fitRect(0, 100, 50, 50), null);
  assert.equal(fitRect(100, 0, 50, 50), null);
  assert.equal(fitRect(100, 100, 0, 50), null);
  assert.equal(fitRect(100, 100, 50, 0), null);
  assert.equal(fitRect(100, 100, NaN, 50), null);
  assert.equal(fitRect(100, 100, Infinity, 50), null);
});
