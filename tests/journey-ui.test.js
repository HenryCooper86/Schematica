import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { addStep } from '../src/journey.js';
import { initJourney } from '../src/ui/journey-ui.js';
import { initI18n, setLang } from '../src/i18n.js';
import { MAX_SHARE_BYTES } from '../src/share.js';

function setup(t, { reducedMotion = true } = {}) {
  // Reset the shared locale while the DOM used by its listeners still exists.
  t.after(() => setLang('en'));
  const elements = new Map(), frames = new Map(), overlays = [], copied = [];
  const replace = (key, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  };
  const element = () => ({ hidden: true, open: false, offsetHeight: 20, value: '4000',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(event, fn) { this[event] = fn; },
    setAttribute() {}, replaceChildren() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, select() {}, scrollIntoView() {}, contains: () => false,
    showModal() { if (this.open) throw new Error('Dialog already open'); this.open = true; this.shown = (this.shown || 0) + 1; },
    close() { this.open = false; },
  });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  replace('document', { getElementById: get, createElement: element, addEventListener() {}, querySelector: () => null });
  replace('window', { matchMedia: () => ({ matches: reducedMotion }), addEventListener() {}, removeEventListener() {} });
  replace('location', { origin: 'https://example.test', pathname: '/' });
  replace('navigator', { clipboard: { writeText: async value => copied.push(value) } });
  replace('CompressionStream', undefined);
  let frameId = 0;
  replace('requestAnimationFrame', fn => { frames.set(++frameId, fn); return frameId; });
  replace('cancelAnimationFrame', id => frames.delete(id));
  t.mock.method(globalThis, 'setTimeout', () => 1);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  initI18n({ storage: null }); setLang('en');
  const store = new Store(newDoc('Whole board'));
  const step = addStep(store, { cx: 100, cy: 100, zoom: 2 });
  const tools = { view: { x: 0, y: 0, zoom: 1 }, ui: {} };
  const api = initJourney({ svg: { getBoundingClientRect: () => ({ width: 800, height: 600 }), addEventListener() {} },
    store, tools, render() {}, recorder: { setOverlay: (...args) => overlays.push(args) }, propsPanel: { render() {} } });
  api.openMoment(new URLSearchParams({ step, present: '1' }));
  return { store, tools, get, frames, overlays, copied };
}

test('changing language keeps the all-board presentation instead of returning to a chapter', t => {
  const h = setup(t);
  h.get('present-all').click();
  setLang('zh');
  assert.equal(h.get('present-title').textContent, 'Whole board');
  assert.equal(h.get('present-copy').disabled, true);
  assert.deepEqual(h.overlays.at(-1), ['', '']);
});

test('replacing the board outside presentation cancels a pending journey camera tween', t => {
  const h = setup(t, { reducedMotion: false });
  h.get('present-exit').click();
  // A Go button uses the same camera path; expose the real panel's generated controls.
  h.get('journey-panel').hidden = false;
  const go = { dataset: { jact: 'go' }, closest: () => ({ dataset: { step: h.store.doc.journey[0].id } }),
    addEventListener(event, fn) { this[event] = fn; } };
  h.get('journey-panel').querySelectorAll = selector => selector === '[data-jact]' ? [go] : [];
  h.store.setSelection([]);
  go.click({});
  assert.ok(h.frames.size > 0);
  h.store.replaceDoc(newDoc('Replacement'));
  assert.equal(h.frames.size, 0);
});

for (const transition of ['exit', 'replace', 'all']) {
  test(`a pending moment share does not open a dialog after ${transition}`, async t => {
    const h = setup(t);
    const pending = h.get('present-copy').click();
    if (transition === 'exit') h.get('present-exit').click();
    else if (transition === 'replace') h.store.replaceDoc(newDoc('Replacement'));
    else h.get('present-all').click();
    await pending;
    assert.equal(h.get('story-link-dialog').open, false);
    assert.deepEqual(h.copied, []);
  });
}

test('overlapping moment shares open one modal without an unhandled rejection', async t => {
  const h = setup(t);
  await Promise.all([h.get('present-copy').click(), h.get('present-copy').click()]);
  assert.equal(h.get('story-link-dialog').shown, 1);
  assert.equal(h.copied.length, 1);
});

test('moment share encoding failures produce feedback rather than rejecting the click', async t => {
  const h = setup(t);
  h.store.doc.notes.push({ id: 'large', text: 'x'.repeat(MAX_SHARE_BYTES) });
  await assert.doesNotReject(h.get('present-copy').click());
  assert.equal(h.get('toast').textContent, 'This share link is too large to open.');
  assert.equal(h.get('story-link-dialog').open, false);
});
