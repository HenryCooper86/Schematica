import test from 'node:test'; import assert from 'node:assert/strict';
import { createRevisions, conflictStorage } from '../src/revisions.js';
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
