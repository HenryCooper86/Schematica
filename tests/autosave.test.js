import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { createAutosave } from '../src/autosave.js';

function setup() {
  const store = new Store(newDoc('Start'));
  const writes = [], timers = new Map();
  let id = 0, failures = 0, blocked = false;
  const autosave = createAutosave({ store,
    storage: { setItem(key, value) { if (blocked) throw new Error('full'); writes.push(JSON.parse(value)); } },
    schedule(fn) { timers.set(++id, fn); return id; }, cancel(id) { timers.delete(id); },
    onError() { failures++; },
  });
  return { store, writes, timers, autosave, block(value) { blocked = value; }, failures: () => failures };
}

test('selection does not save or postpone a document edit', () => {
  const { store, writes, timers, autosave } = setup();
  store.setSelection(['n']);
  assert.equal(timers.size, 0);
  store.apply(doc => { doc.title = 'Edited'; });
  const timer = [...timers.keys()][0];
  store.clearSelection();
  assert.deepEqual([...timers.keys()], [timer]);
  autosave.flush();
  assert.equal(writes[0].title, 'Edited');
  assert.equal(timers.size, 0);
  autosave.flush();
  assert.equal(writes.length, 1);
});

test('lifecycle flush persists the latest edit without waiting for debounce', () => {
  const { store, writes, timers, autosave } = setup();
  store.apply(doc => { doc.title = 'First'; });
  store.apply(doc => { doc.title = 'Latest'; });
  autosave.flush();
  assert.equal(writes.at(-1).title, 'Latest');
  assert.equal(timers.size, 0);
});

test('failed saves retry, with one notification per failure streak', () => {
  const s = setup();
  s.block(true);
  s.store.apply(doc => { doc.title = 'Keep me'; });
  s.autosave.flush(); s.autosave.flush();
  assert.equal(s.failures(), 1);
  s.block(false); s.autosave.flush();
  assert.equal(s.writes.at(-1).title, 'Keep me');
  s.block(true); s.store.apply(doc => { doc.title = 'Next'; }); s.autosave.flush();
  assert.equal(s.failures(), 2);
});
