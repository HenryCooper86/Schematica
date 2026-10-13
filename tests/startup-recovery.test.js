import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, newDoc } from '../src/state.js';
import { createAutosave } from '../src/autosave.js';
import { conflictStorage } from '../src/revisions.js';
import { createStartupRecovery, RECOVERY_PREFIX } from '../src/startup-recovery.js';

function memory(raw) {
  const data = new Map(raw === undefined ? [] : [['schematica.autosave', raw]]);
  return { data, blocked: false, get length() { return data.size; }, key: i => [...data.keys()][i],
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (this.blocked) throw Error('quota'); data.set(key, value); },
    removeItem: key => data.delete(key),
  };
}
function setup(storage) {
  const recovery = createStartupRecovery(storage), store = new Store(recovery.doc || newDoc());
  const conflicts = [];
  const persistence = conflictStorage(storage, { getDoc: () => store.doc, revisions: { save() {} }, onConflict: x => conflicts.push(x) });
  const statuses = [];
  const autosave = createAutosave({ store, storage: recovery.protect(persistence), schedule: () => 0, cancel() {}, onStatus: x => statuses.push(x) });
  return { recovery, store, autosave, statuses, conflicts };
}
test('malformed startup bytes survive edits and reload with a visible recovery entry', () => {
  const raw = '{"nodes":', storage = memory(raw), s = setup(storage);
  assert.equal(s.recovery.doc, null);
  assert.equal(s.recovery.pending(), true);
  s.store.apply(doc => { doc.title = 'New work'; }); s.autosave.flush();
  assert.equal(JSON.parse(storage.getItem('schematica.autosave')).title, 'New work');
  const fresh = createStartupRecovery(storage);
  assert.equal(fresh.list()[0].text, raw);
  assert.equal(fresh.list()[0].durable, true);
  assert.equal(fresh.pending(), true);
  assert.ok(fresh.list()[0].error);
});
test('repair warnings and exact original content survive acknowledgement and reload', () => {
  const doc = newDoc('Repair'); doc.nodes = [
    { id: 'n1', kind: 'mcu', x: 0, y: 0, label: 'First' },
    { id: 'n1', kind: 'mcu', x: 300, y: 0, label: 'Duplicate' },
  ];
  const raw = JSON.stringify(doc, null, 4), storage = memory(raw), s = setup(storage);
  assert.equal(s.recovery.doc.nodes.length, 1);
  assert.ok(s.recovery.list()[0].warnings.some(w => w.includes('duplicate')));
  s.recovery.acknowledge(s.recovery.list()[0].id);
  assert.equal(s.recovery.pending(), false);
  s.store.apply(d => { d.title = 'Repaired'; }); s.autosave.flush();
  const fresh = createStartupRecovery(storage);
  assert.equal(fresh.list()[0].text, raw);
  assert.equal(fresh.pending(), false);
});
test('failed quarantine prevents overwriting the original until retry succeeds', () => {
  const raw = '{"nodes":', storage = memory(raw); storage.blocked = true;
  const s = setup(storage);
  s.store.apply(doc => { doc.title = 'Keep edit in memory'; }); s.autosave.flush();
  assert.equal(storage.getItem('schematica.autosave'), raw);
  assert.equal(s.statuses.at(-1), 'error');
  assert.equal(s.recovery.list()[0].text, raw);
  assert.equal(s.recovery.list()[0].durable, false);
  assert.throws(() => s.recovery.acknowledge(s.recovery.list()[0].id));
  storage.blocked = false; s.recovery.retry(); s.autosave.flush();
  assert.equal(s.recovery.list()[0].durable, true);
  assert.equal(JSON.parse(storage.getItem('schematica.autosave')).title, 'Keep edit in memory');
});
test('a recovery copy does not bypass another tab changing the working board', () => {
  const storage = memory('{'), s = setup(storage);
  storage.setItem('schematica.autosave', JSON.stringify(newDoc('Other tab')));
  s.store.apply(doc => { doc.title = 'Local'; }); s.autosave.flush();
  assert.equal(JSON.parse(storage.getItem('schematica.autosave')).title, 'Other tab');
  assert.equal(s.conflicts.length, 1);
  assert.equal(s.recovery.list()[0].text, '{');
});
test('reopening the same damaged autosave reuses its existing recovery copy', () => {
  const storage = memory('{'); createStartupRecovery(storage); const fresh = createStartupRecovery(storage);
  assert.equal(fresh.list().length, 1);
  assert.equal([...storage.data.keys()].filter(k => k.startsWith(RECOVERY_PREFIX)).length, 1);
});
test('healthy and empty storage do not create recovery notices', () => {
  for (const storage of [memory(), memory(JSON.stringify(newDoc('Healthy')))]) {
    const recovery = createStartupRecovery(storage);
    assert.equal(recovery.pending(), false);
    assert.deepEqual(recovery.list(), []);
  }
});

test('retry after an unreadable startup preserves even a healthy unseen original', () => {
  const raw = JSON.stringify(newDoc('Previously inaccessible')), storage = memory(raw);
  const getItem = storage.getItem; let blocked = true;
  storage.getItem = key => { if (blocked) throw Error('blocked read'); return getItem(key); };
  const recovery = createStartupRecovery(storage), guarded = recovery.protect(storage);
  assert.ok(recovery.readError);
  assert.throws(() => guarded.setItem('schematica.autosave', 'new work'));
  blocked = false; recovery.retry();
  assert.equal(recovery.readError, '');
  guarded.setItem('schematica.autosave', 'new work');
  assert.equal(recovery.list()[0].text, raw);
});

test('a changed recovery copy cannot replace the original retained in memory', () => {
  const storage = memory('{'), recovery = createStartupRecovery(storage), entry = recovery.list()[0];
  storage.setItem(RECOVERY_PREFIX + entry.id, JSON.stringify({ ...entry, text: 'different data' }));
  recovery.refresh();
  assert.equal(recovery.list()[0].text, '{');
  assert.throws(() => recovery.protect(storage).setItem('schematica.autosave', 'new work'));
  assert.equal(storage.getItem('schematica.autosave'), '{');
});

test('a deleted recovery copy loses its durable status and can be preserved again', () => {
  const storage = memory('{'), recovery = createStartupRecovery(storage);
  const entry = recovery.list()[0], key = RECOVERY_PREFIX + entry.id;
  recovery.acknowledge(entry.id);
  storage.removeItem(key);
  recovery.refresh();
  assert.equal(recovery.list()[0].durable, false);
  assert.equal(recovery.pending(), true);
  assert.equal(recovery.list()[0].text, '{');
  recovery.retry();
  assert.equal(recovery.list()[0].durable, true);
  assert.equal(JSON.parse(storage.getItem(key)).text, '{');
  assert.equal(recovery.pending(), false);
});

test('an unreadable recovery copy loses its durable status without losing original bytes', () => {
  const storage = memory('{'), recovery = createStartupRecovery(storage);
  const entry = recovery.list()[0];
  storage.setItem(RECOVERY_PREFIX + entry.id, '{broken archive');
  recovery.refresh();
  assert.equal(recovery.list()[0].durable, false);
  assert.equal(recovery.list()[0].text, '{');
  assert.equal(recovery.blocked(), true);
});

test('malformed recovery identities and dates do not create unusable review entries', () => {
  const storage = memory();
  storage.setItem(RECOVERY_PREFIX + '42', JSON.stringify({ id: 42, at: 1, text: '{', reviewed: true }));
  storage.setItem(RECOVERY_PREFIX + 'future', JSON.stringify({ id: 'future', at: 1e100, text: '{', reviewed: true }));
  const recovery = createStartupRecovery(storage);
  assert.deepEqual(recovery.list(), []);
  assert.equal(recovery.pending(), false);
  assert.equal(storage.length, 2, 'malformed archives remain untouched for manual recovery');
});

test('retry cannot mark a recovery copy with mismatched metadata as durably preserved', () => {
  const storage = memory('{'), recovery = createStartupRecovery(storage);
  const entry = recovery.list()[0], key = RECOVERY_PREFIX + entry.id;
  storage.setItem(key, JSON.stringify({ id: 'different-id', at: entry.at, text: entry.text }));
  recovery.refresh();
  recovery.retry();
  assert.equal(recovery.list()[0].durable, false);
  assert.equal(recovery.blocked(), true);
  assert.equal(recovery.list()[0].text, '{');
  assert.throws(() => recovery.protect(storage).setItem('schematica.autosave', 'New work'));
  assert.equal(storage.getItem('schematica.autosave'), '{');
});
