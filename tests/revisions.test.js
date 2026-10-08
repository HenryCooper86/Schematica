import test from 'node:test'; import assert from 'node:assert/strict';
import { createRevisions, conflictStorage, REVISION_PREFIX } from '../src/revisions.js';
import { newDoc } from '../src/state.js';
function memory() { const map = new Map(); return { get length(){return map.size;}, key:i=>[...map.keys()][i], getItem:k=>map.get(k)??null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) }; }
test('revisions survive another instance and retain the latest 30 snapshots', () => {
  const storage=memory(), a=createRevisions(storage); let last;
  for(let i=0;i<35;i++) last=a.save(newDoc('Board '+i));
  const b=createRevisions(storage); assert.equal(b.list().length,30); assert.equal(b.restore(last.id).title,'Board 34');
});
test('a failed durable write retains the snapshot in memory and reports the failure', () => {
  let errors=0; const r=createRevisions({length:0,setItem(){throw new Error('full');},getItem(){return null;}},{onError:()=>errors++});
  const saved=r.save(newDoc('Keep'));assert.equal(errors,1);assert.equal(r.restore(saved.id).title,'Keep');
});

function transientStorage() {
  const storage = memory(), write = storage.setItem;
  storage.blocked = false;
  storage.setItem = (key, value) => {
    if (storage.blocked) throw new Error('quota');
    write(key, value);
  };
  return storage;
}

test('fallback retry persists the original memory-only revision for a fresh instance', async () => {
  const storage = transientStorage(), errors = [];
  let changes = 0;
  const revisions = createRevisions(storage, { onError: e => errors.push(e), onChange: () => changes++ });
  storage.blocked = true;
  const pending = revisions.save(newDoc('Recovery'), 'Before edit', 'automatic');
  const original = { ...pending };
  assert.equal(revisions.list()[0].durable, false);
  assert.equal(storage.length, 0);
  storage.blocked = false;
  await revisions.retry();
  const fresh = createRevisions(storage);
  assert.equal(fresh.restore(pending.id).title, 'Recovery');
  assert.deepEqual(fresh.list()[0], { ...original, durable: true });
  assert.equal(revisions.list()[0].durable, true);
  assert.equal(errors.length, 1);
  assert.equal(changes, 2);
  await revisions.retry();
  assert.equal(storage.length, 1);
  assert.equal(changes, 2);
});

test('failed fallback retry reports the error and retains pending and old durable revisions', async () => {
  const storage = transientStorage(), errors = [];
  const revisions = createRevisions(storage, { onError: e => errors.push(e.message) });
  const old = revisions.save(newDoc('Old'));
  const stored = storage.getItem(REVISION_PREFIX + old.id);
  storage.blocked = true;
  const pending = revisions.save(newDoc('Pending'));
  await revisions.retry();
  assert.deepEqual(errors, ['quota', 'quota']);
  assert.equal(storage.getItem(REVISION_PREFIX + old.id), stored);
  assert.equal(storage.length, 1);
  assert.equal(revisions.restore(old.id).title, 'Old');
  assert.equal(revisions.restore(pending.id).title, 'Pending');
  assert.equal(revisions.list().find(e => e.id === pending.id).durable, false);
});

test('fallback count rotation waits for durable writes and retains every pending snapshot', async () => {
  const storage = transientStorage(), revisions = createRevisions(storage);
  storage.blocked = true;
  const pending = Array.from({ length: 31 }, (_, i) => revisions.save(newDoc('Pending ' + i)));
  assert.equal(revisions.list().length, 31);
  assert.equal(revisions.restore(pending[0].id).title, 'Pending 0');
  await revisions.retry();
  assert.equal(revisions.list().length, 31);
  assert.equal(storage.length, 0);
  storage.blocked = false;
  await revisions.retry();
  const fresh = createRevisions(storage);
  assert.equal(fresh.list().length, 30);
  assert.throws(() => fresh.restore(pending[0].id), /Revision not found/);
  assert.equal(fresh.restore(pending[30].id).title, 'Pending 30');
  assert.ok(revisions.list().every(e => e.durable));
});

test('fallback byte rotation keeps old durable data until a pending write succeeds', async () => {
  const storage = transientStorage(), revisions = createRevisions(storage);
  const large = title => ({ ...newDoc(title), notes: [{ id: 'note', x: 0, y: 0, text: 'x'.repeat(2 * 1024 * 1024) }] });
  const old = revisions.save(large('Old large board'));
  storage.blocked = true;
  const pending = revisions.save(large('New large board'));
  await revisions.retry();
  assert.ok(storage.getItem(REVISION_PREFIX + old.id));
  assert.equal(revisions.restore(pending.id).title, 'New large board');
  storage.blocked = false;
  await revisions.retry();
  const fresh = createRevisions(storage);
  assert.equal(fresh.list().length, 1);
  assert.equal(fresh.restore(pending.id).title, 'New large board');
  assert.equal(storage.getItem(REVISION_PREFIX + old.id), null);
});

test('fallback retry keeps a failed snapshot pending while persisting the other snapshots', async () => {
  const storage = transientStorage(), revisions = createRevisions(storage);
  storage.blocked = true;
  const pending = ['First', 'Middle', 'Last'].map(title => revisions.save(newDoc(title)));
  storage.blocked = false;
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === REVISION_PREFIX + pending[1].id) throw new Error('still blocked');
    write(key, value);
  };
  await revisions.retry();
  const fresh = createRevisions(storage);
  assert.deepEqual(fresh.list().map(e => fresh.restore(e.id).title), ['Last', 'First']);
  assert.equal(revisions.restore(pending[1].id).title, 'Middle');
  assert.equal(revisions.list().find(e => e.id === pending[1].id).durable, false);
  storage.setItem = write;
  await revisions.retry();
  assert.equal(createRevisions(storage).restore(pending[1].id).title, 'Middle');
});

test('fallback instances observe externally removed durable revisions', () => {
  const storage = memory(), first = createRevisions(storage);
  const removed = first.save(newDoc('Removed elsewhere'));
  storage.removeItem(REVISION_PREFIX + removed.id);
  assert.deepEqual(first.list(), []);
  assert.throws(() => first.restore(removed.id), /Revision not found/);
});

test('fallback instances observe another writer rotating durable revisions', () => {
  const storage = memory(), first = createRevisions(storage), other = createRevisions(storage);
  const oldest = first.save(newDoc('Rotated elsewhere'));
  for (let i = 0; i < 30; i++) other.save(newDoc('Other ' + i));
  assert.equal(first.list().length, 30);
  assert.throws(() => first.restore(oldest.id), /Revision not found/);
  assert.ok(first.list().every(e => e.durable));
});
test('another tab cannot be overwritten silently and both versions are recoverable', () => {
  const storage=memory();storage.setItem('schematica.autosave',JSON.stringify(newDoc('Original')));
  const revisions=createRevisions(storage);let conflict;
  const p=conflictStorage(storage,{getDoc:()=>newDoc('Mine'),revisions,onConflict:c=>conflict=c});
  storage.setItem('schematica.autosave',JSON.stringify(newDoc('Theirs')));
  assert.throws(()=>p.setItem('schematica.autosave',JSON.stringify(newDoc('Mine'))),/Another tab/);
  assert.equal(conflict.doc.title,'Theirs');assert.equal(revisions.list().length,2);
  assert.equal(JSON.parse(storage.getItem('schematica.autosave')).title,'Theirs');
  p.resolve();p.setItem('schematica.autosave',JSON.stringify(newDoc('Mine')));
  assert.equal(JSON.parse(storage.getItem('schematica.autosave')).title,'Mine');
});

test('resolving a conflict refuses a newer remote version and preserves it for review', () => {
  const storage = memory(), key = 'schematica.autosave';
  storage.setItem(key, JSON.stringify(newDoc('Original')));
  const revisions = createRevisions(storage);
  const p = conflictStorage(storage, { getDoc: () => newDoc('Mine'), revisions, onConflict() {} });
  storage.setItem(key, JSON.stringify(newDoc('First remote')));
  p.observe(storage.getItem(key));
  storage.setItem(key, JSON.stringify(newDoc('Newer remote')));
  assert.throws(() => p.resolve(), /Another tab/);
  assert.equal(p.pending().doc.title, 'Newer remote');
  assert.equal(JSON.parse(storage.getItem(key)).title, 'Newer remote');
  assert.ok(revisions.list().some(r => revisions.restore(r.id).title === 'Newer remote'));
  p.resolve();
  assert.equal(p.pending(), null);
});

test('a failed storage read while resolving retains the pending conflict', () => {
  const storage = memory(), key = 'schematica.autosave';
  const p = conflictStorage(storage, { getDoc: () => newDoc('Mine'), revisions: createRevisions(storage), onConflict() {} });
  storage.setItem(key, JSON.stringify(newDoc('Remote')));
  p.observe(storage.getItem(key));
  storage.getItem = () => { throw new Error('Storage blocked'); };
  assert.throws(() => p.resolve(), /Storage blocked/);
  assert.equal(p.pending()?.doc.title, 'Remote');
});
