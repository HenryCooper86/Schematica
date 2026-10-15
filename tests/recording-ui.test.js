import test from 'node:test';
import assert from 'node:assert/strict';
import { initRecording } from '../src/ui/recording-ui.js';
import { Store } from '../src/state.js';

function setup(t, video = true, now = 1000) {
  const elements = new Map(); let formats = [], allow;
  const replace = (key, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  };
  const element = () => {
    const classes = new Set();
    return { open: false, disabled: false, files: [],
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
        toggle: (name, force) => { if (force) classes.add(name); else classes.delete(name); } },
      addEventListener(event, fn) { this[event] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
  };
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  Object.defineProperty(get('rec-formats'), 'innerHTML', { set(html) {
    formats = [...html.matchAll(/value="([^"]+)"( checked)?/g)].map(match => Object.assign(element(), { value: match[1], checked: !!match[2] }));
  } });
  replace('document', { getElementById: get,
    querySelectorAll: () => formats,
    querySelector: query => query.includes('rec-format') ? formats.find(r => r.checked) : { value: 'mic' },
    createElement: () => ({ getContext: () => ({}), captureStream: () => ({ addTrack() {}, getTracks: () => [{ stop() {} }] }) }),
    createElementNS: () => ({}),
  });
  replace('window', { devicePixelRatio: 1 });
  replace('navigator', { mediaDevices: { getUserMedia: () => new Promise(resolve => { allow = resolve; }) } });
  replace('MediaRecorder', class { static isTypeSupported() { return video; } start() {} stop() {} });
  replace('XMLSerializer', class { serializeToString() { return '<svg/>'; } });
  replace('Image', class { decode() { return new Promise(() => {}); } });
  replace('requestAnimationFrame', () => 1); replace('cancelAnimationFrame', () => {});
  t.mock.method(globalThis, 'setInterval', () => 1); t.mock.method(globalThis, 'clearInterval', () => {});
  t.mock.method(performance, 'now', () => now);
  const recorder = initRecording({ svg: { getBoundingClientRect: () => ({ width: 16, height: 16 }),
    cloneNode: () => ({ querySelectorAll: () => [], setAttribute() {}, append() {} }) }, store: new Store() });
  get('btn-rec').click();
  return { recorder, get, allow: () => allow({ getAudioTracks: () => [{}], getTracks: () => [{ stop() {} }] }) };
}

test('the first recording click opens the dialog even immediately after startup', t => {
  const h = setup(t, true, 100);
  assert.equal(h.get('rec-dialog').open, true);
});

test('pending microphone startup disables both recording activation buttons', async t => {
  const h = setup(t);
  const pending = h.get('rec-start').click();
  const disabled = [h.get('btn-rec').disabled, h.get('rec-start').disabled];
  h.get('rec-cancel').click(); h.allow(); await pending;
  assert.deepEqual(disabled, [true, true]);
});

for (const action of ['button', 'escape', 'backdrop']) {
  test(`${action} cancellation prevents a pending microphone startup from recording`, async t => {
    const h = setup(t);
    const pending = h.get('rec-start').click();
    if (action === 'button') h.get('rec-cancel').click();
    else if (action === 'escape') h.get('rec-dialog').cancel?.();
    else h.get('rec-dialog').pointerdown({ target: h.get('rec-dialog') });
    h.allow(); await pending;
    assert.equal(h.recorder.state().recording, false);
    assert.equal(h.get('rec-start').disabled, false);
  });
}

test('GIF-only browsers show audio controls disabled on opening the dialog', t => {
  const h = setup(t, false);
  assert.equal(h.get('rec-audio').classList.contains('disabled'), true);
});
