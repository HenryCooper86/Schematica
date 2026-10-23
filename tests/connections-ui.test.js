import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';
import { EXAMPLES } from '../src/examples.js';
import { initConnections } from '../src/ui/connections.js';

// Exercise the real dialog handlers with select semantics, without a browser.
function mount(t, store) {
  const controls = new Map();
  const select = () => ({
    value: '',
    set innerHTML(html) {
      this.options = [...html.matchAll(/<option value="([^"]*)">/g)].map(match => match[1]);
      this.value = this.options[0] || '';
    },
    focus() {},
  });
  for (const end of ['from', 'to']) {
    controls.set(`#connect-${end}-node`, select());
    controls.set(`#connect-${end}-port`, select());
  }
  controls.set('#connect-bus', select());
  for (const query of ['#connect-error', '[type=submit]', '#connect-cancel', 'form']) controls.set(query, {});
  const button = { focus() {} };
  const dialog = {
    open: false,
    setAttribute() {},
    addEventListener() {},
    querySelector: query => controls.get(query),
    showModal() { this.open = true; },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    activeElement: button,
    createElement: tag => tag === 'button' ? button : dialog,
    getElementById: () => ({ after() {} }),
    addEventListener() {},
    body: { append() {} },
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  });
  return { open: initConnections({ store }).open, controls };
}

for (const selected of [[], ['n1'], ['n2'], ['n5'], ['n2', 'n5']]) {
  test(`connection dialog chooses distinct initial parts with selection ${JSON.stringify(selected)}`, t => {
    const store = new Store(structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc));
    store.setSelection(selected);
    const { open, controls } = mount(t, store);
    open();
    const from = controls.get('#connect-from-node').value, to = controls.get('#connect-to-node').value;
    assert.notEqual(from, to);
    if (selected.length) assert.equal(from, selected[0]);
    if (selected.length > 1) assert.equal(to, selected[1]);
    assert.equal(controls.get('[type=submit]').disabled, false);
    assert.equal(controls.get('#connect-error').textContent, '');
    assert.equal(store.undoStack.length, 0);
    assert.deepEqual([...store.selection], selected);
  });
}
