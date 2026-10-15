import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { initDialogs } from '../src/ui/dialogs.js';
import { setThemePreference } from '../src/theme.js';
import { initI18n, setLang } from '../src/i18n.js';

function setup(t) {
  const elements = new Map(), downloads = [], images = [];
  const replace = (key, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  };
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, files: [], classList: { add() {}, remove() {} },
      addEventListener(event, fn) { this[event] = fn; }, close() {},
    });
    return elements.get(id);
  };
  const context = { drawImage() {}, fillRect() {}, scale() {} };
  replace('document', {
    getElementById: get, querySelectorAll: () => [],
    createElement: tag => tag === 'canvas' ? { getContext: () => context, toBlob: fn => fn(new Blob(['pixels'])) }
      : { click() { downloads.push(this.download); } },
  });
  replace('Image', class {
    constructor() { images.push(this); this.width = 16; this.height = 16; }
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:export-test');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'setTimeout', () => 1);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  initI18n({ storage: null }); setLang('en'); setThemePreference('dark');
  t.after(() => { setLang('en'); setThemePreference('system'); });
  const store = new Store(newDoc('Original board'));
  store.doc.nodes.push({ id: 'part', kind: 'mcu', label: 'Original part', x: 0, y: 0, locked: true });
  initDialogs({ store });
  get('export-w').value = '16'; get('export-h').value = '16'; get('export-theme').value = 'current';
  return { store, get, downloads, images };
}

for (const [button, extension] of [['export-png-go', 'png'], ['export-pdf-go', 'pdf']]) {
  test(`${extension.toUpperCase()} filename belongs to the board rendered before asynchronous decoding`, async t => {
    const h = setup(t);
    h.get(button).click();
    h.store.replaceDoc(newDoc('Replacement board'));
    await h.images[0].onload();
    // PDF's JPEG conversion finishes in a microtask.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.downloads, [`Original_board.${extension}`]);
  });
}
