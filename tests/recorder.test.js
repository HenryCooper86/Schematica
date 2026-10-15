import test from 'node:test';
import assert from 'node:assert/strict';
import { fitRect, createRecorder } from '../src/recorder.js';
import { setThemePreference } from '../src/theme.js';

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


function recorderHarness(t) {
  const images = [], intervals = [], timeouts = [], downloads = [], draws = [], recorders = [], revoked = [], blobs = [], captions = [];
  const replace = (key, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  };
  const tracks = [];
  const stream = () => {
    const track = { stops: 0, stop() { this.stops++; } };
    tracks.push(track);
    return { getTracks: () => [track], addTrack() {} };
  };
  const context = { fillRect() {}, drawImage() { draws.push(this.fillStyle); },
    beginPath() {}, rect() {}, fill() {}, stroke() {},
    measureText: text => ({ width: text.length * 8 }), fillText: text => captions.push(text),
    getImageData: () => ({ data: new Uint8ClampedArray(16 * 16 * 4).fill(255) }) };
  replace('document', { createElement: tag => tag === 'canvas'
    ? { getContext: () => context, captureStream: stream }
    : { click() { downloads.push(this.download); } },
  createElementNS: () => ({}) });
  replace('window', { devicePixelRatio: 1 });
  replace('XMLSerializer', class { serializeToString() { return '<svg/>'; } });
  replace('Image', class {
    constructor() { images.push(this); }
    decode() { return new Promise((resolve, reject) => { this.finish = resolve; this.fail = reject; }); }
  });
  replace('MediaRecorder', class {
    static isTypeSupported() { return true; }
    constructor() { recorders.push(this); }
    start() {}
    stop() {}
  });
  replace('requestAnimationFrame', () => 1);
  replace('cancelAnimationFrame', () => {});
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; });
  t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; });
  t.mock.method(URL, 'createObjectURL', blob => { blobs.push(blob); return `blob:${blobs.length}`; });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  const svg = { getBoundingClientRect: () => ({ width: 16, height: 16 }),
    cloneNode: () => ({ querySelectorAll: () => [], setAttribute() {}, append() {} }) };
  const notices = [];
  const recorder = createRecorder(svg, { notify: message => notices.push(message) });
  return { recorder, images, intervals, timeouts, downloads, draws, recorders, tracks, revoked, notices, blobs, captions,
    encode: () => timeouts.filter(job => job.ms === 30).at(-1).fn(),
    gifTick: () => intervals.filter(job => job.ms === 100).at(-1).fn() };
}

test('video stop stays encoding until final data and stop events are saved', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'webm-vp9', basename: 'first' });
  h.recorder.stop();
  assert.equal(h.recorder.state().encoding, true);
  await h.recorder.start({ format: 'webm-vp9', basename: 'second' });
  assert.equal(h.recorders.length, 1, 'a second start cannot steal the pending video chunks');
  h.recorders[0].ondataavailable({ data: new Blob(['first video']) });
  h.recorders[0].onstop();
  assert.deepEqual(h.downloads, ['first.webm']);
  assert.equal(await h.blobs.at(-1).text(), 'first video');
  assert.equal(h.recorder.state().encoding, false);
  assert.equal(h.tracks[0].stops, 1);
});

test('an old GIF decode cannot draw into or contribute frames to a new recording', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'gif', basename: 'first' });
  const oldFrame = h.gifTick();
  h.recorder.stop(); h.encode();
  await h.recorder.start({ format: 'gif', basename: 'second' });
  h.images[0].finish(); await oldFrame;
  assert.deepEqual(h.draws, []);
  const nextFrame = h.gifTick();
  h.images[1].finish(); await nextFrame;
  h.recorder.stop(); h.encode();
  assert.deepEqual(h.downloads, ['second.gif']);
  assert.equal(h.revoked.length, 2);
});

test('a recording frame paints the same theme captured in its SVG before decode', async t => {
  const h = recorderHarness(t);
  setThemePreference('dark');
  t.after(() => setThemePreference('system'));
  await h.recorder.start({ format: 'gif' });
  const frame = h.gifTick();
  setThemePreference('light');
  h.images[0].finish(); await frame;
  assert.deepEqual(h.draws, ['#0a0e17']);
  h.recorder.stop(); h.encode();
});

test('a delayed recording frame retains the caption and counter captured with its image', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'gif' });
  h.recorder.setOverlay('First frame', '1 / 2');
  const frame = h.gifTick();
  h.recorder.setOverlay('Second frame', '2 / 2');
  h.images[0].finish(); await frame;
  assert.deepEqual(h.captions, ['First frame', '1 / 2']);
  h.recorder.stop(); h.encode();
});

test('stopping during microphone permission cancels startup and releases the eventual stream', async t => {
  const h = recorderHarness(t);
  let allow;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let microphoneStops = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getUserMedia: () => new Promise(resolve => { allow = resolve; }),
  } } });
  t.after(() => original ? Object.defineProperty(globalThis, 'navigator', original) : delete globalThis.navigator);
  const pending = h.recorder.start({ format: 'webm-vp9', audio: 'mic' });
  h.recorder.stop();
  allow({ getAudioTracks: () => [{}], getTracks: () => [{ stop: () => microphoneStops++ }] });
  await pending;
  assert.equal(h.recorder.state().recording, false);
  assert.equal(h.recorders.length, 0);
  assert.equal(microphoneStops, 1);
  assert.equal(h.tracks[0].stops, 1);
});

test('capture failures from a previous recording do not abort a new session', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'gif' });
  for (let i = 0; i < 2; i++) {
    const frame = h.gifTick();
    h.images.at(-1).fail(new Error('decode failed')); await frame;
  }
  h.recorder.stop(); h.encode();
  await h.recorder.start({ format: 'gif' });
  const frame = h.gifTick();
  h.images.at(-1).fail(new Error('decode failed')); await frame;
  assert.equal(h.recorder.state().recording, true);
  h.recorder.stop(); h.encode();
});

test('late events from an aborted video cannot abort a newer recording', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'webm-vp9', basename: 'first' });
  h.recorders[0].onerror();
  await h.recorder.start({ format: 'webm-vp9', basename: 'second' });
  h.recorders[0].ondataavailable({ data: new Blob(['obsolete']) });
  h.recorders[0].onerror();
  assert.equal(h.recorder.state().recording, true);
  h.recorder.stop();
  h.recorders[1].ondataavailable({ data: new Blob(['current']) });
  h.recorders[1].onstop();
  assert.deepEqual(h.downloads, ['second.webm']);
  assert.equal(await h.blobs.at(-1).text(), 'current');
});

test('an encoder failure during finalization discards the partial video and releases encoding', async t => {
  const h = recorderHarness(t);
  await h.recorder.start({ format: 'webm-vp9' });
  h.recorder.stop();
  h.recorders[0].ondataavailable({ data: new Blob(['partial']) });
  h.recorders[0].onerror();
  h.recorders[0].onstop?.();
  assert.equal(h.recorder.state().encoding, false);
  assert.deepEqual(h.downloads, []);
});

for (const stage of ['read', 'decode']) {
  test(`cancelling pending music ${stage} releases audio without starting a recording`, async t => {
    const h = recorderHarness(t);
    let finishRead, finishDecode, closes = 0, sources = 0;
    const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {
      decodeAudioData() { return new Promise(resolve => { finishDecode = resolve; }); }
      createBufferSource() { sources++; return { connect() {}, start() {} }; }
      createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{}] } }; }
      close() { closes++; return Promise.resolve(); }
    } });
    t.after(() => original ? Object.defineProperty(globalThis, 'AudioContext', original) : delete globalThis.AudioContext);
    const pending = h.recorder.start({ format: 'webm-vp9', audio: 'music',
      musicFile: { arrayBuffer: () => new Promise(resolve => { finishRead = resolve; }) } });
    assert.equal(h.recorder.state().starting, true);
    if (stage === 'decode') {
      finishRead(new ArrayBuffer(1));
      await Promise.resolve();
    }
    h.recorder.stop();
    if (stage === 'read') finishRead(new ArrayBuffer(1)); else finishDecode({});
    await pending;
    assert.equal(h.recorder.state().recording, false);
    assert.equal(h.recorder.state().starting, false);
    assert.equal(h.recorders.length, 0);
    assert.equal(closes, 1);
    assert.equal(sources, 0);
    assert.equal(h.tracks[0].stops, 1);
  });
}
