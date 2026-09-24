import test from 'node:test';
import assert from 'node:assert/strict';

test('frame timing loops seamlessly through the animation module', async () => {
  const { flowOffset, LOOP_MS, pulseOpacity } = await import('../src/render-animation.js');
  assert.equal(flowOffset(0), flowOffset(LOOP_MS));
  assert.equal(pulseOpacity(0), pulseOpacity(LOOP_MS));
});
