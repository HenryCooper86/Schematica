import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../src/playback.js';
test('playback is bounded and cancelled callbacks cannot advance a restarted story', () => {
  const callbacks = []; let advances = 0;
  const p = createPlayback({ advance: () => ++advances < 2, schedule: fn => { callbacks.push(fn); return callbacks.length; }, cancel: () => {} });
  p.play(); p.pause(); p.play();
  callbacks[0](); assert.equal(advances, 0);
  callbacks[1](); assert.equal(advances, 1);
  callbacks[2](); assert.equal(advances, 2); assert.equal(p.playing, false);
});
test('changing playback speed replaces the pending tick', () => {
  const jobs = []; let delay = 4000, advances = 0;
  const p = createPlayback({ advance: () => { advances++; return true; }, delay: () => delay, schedule: (fn, ms) => { jobs.push({fn,ms}); return jobs.length; }, cancel: () => {} });
  p.play(); delay = 2000; p.reschedule();
  assert.equal(jobs[1].ms, 2000); jobs[0].fn(); assert.equal(advances, 0);
  p.pause(); jobs[1].fn(); assert.equal(advances, 0);
});
