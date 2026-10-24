import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjects, REGISTRY_KEY, LEGACY_SLOT, slotFor } from '../src/projects.js';
import { createRevisions } from '../src/revisions.js';
import { newDoc } from '../src/state.js';

const memory = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null, getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map };
};
const clock = (start = 1_000_000) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

test('first run adopts the existing single slot as the project "main" without moving it', () => {
  const storage = memory({ [LEGACY_SLOT]: JSON.stringify({ ...newDoc('Robot arm'), schema: 4 }) });
  const projects = createProjects(storage, { now: clock() });
  assert.equal(projects.activeId(), 'main');
  assert.equal(projects.key(), LEGACY_SLOT);
  assert.equal(projects.active().title, 'Robot arm');
  assert.ok(storage.getItem(REGISTRY_KEY), 'the registry is written');
  assert.equal(storage.getItem(LEGACY_SLOT).includes('Robot arm'), true, 'the slot is untouched');
});

test('projects have stable ids, their own slots and survive a re-read', () => {
  const storage = memory();
  const now = clock();
  const projects = createProjects(storage, { now, untitled: () => 'Untitled' });
  const second = projects.create('Second');
  assert.notEqual(second.id, 'main');
  assert.equal(projects.activeId(), second.id);
  assert.equal(projects.key(), `${LEGACY_SLOT}.${second.id}`);
  assert.equal(slotFor('main'), LEGACY_SLOT);
  const again = createProjects(storage, { now });
  assert.equal(again.activeId(), second.id);
  assert.deepEqual(again.list().map(p => p.title), ['Untitled', 'Second']);
  again.switchTo('main');
  assert.equal(createProjects(storage, { now }).activeId(), 'main');
});

test('a switch or create that cannot be written rolls back and reports', () => {
  const storage = memory();
  const projects = createProjects(storage, { now: clock() });
  const second = projects.create('Second');
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => projects.switchTo('main'), /could not be saved/);
  assert.equal(projects.activeId(), second.id);
  assert.throws(() => projects.create('Third'), /could not be saved/);
  assert.equal(projects.list().length, 2);
});

test('removing a project deletes its slot, keeps the others and refuses the last one', () => {
  const storage = memory();
  const projects = createProjects(storage, { now: clock() });
  const second = projects.create('Second');
  storage.setItem(projects.key(), '{"schema":4,"title":"Second"}');
  assert.equal(projects.remove(second.id), 'main');
  assert.equal(storage.getItem(slotFor(second.id)), null);
  assert.equal(storage.getItem(LEGACY_SLOT), null, 'main never had a board; nothing else is touched');
  assert.throws(() => projects.remove('main'), /last project/);
});

test('the registry mirrors the open board title and knows whether a file backup is current', () => {
  const storage = memory();
  const now = clock();
  const projects = createProjects(storage, { now });
  const doc = newDoc('Sensor node');
  assert.equal(projects.backupState(doc), 'none');
  projects.touch(doc);
  assert.equal(projects.active().title, 'Sensor node');
  projects.markBackup(doc);
  assert.equal(projects.backupState(doc), 'current');
  doc.title = 'Sensor node v2';
  assert.equal(projects.backupState(doc), 'stale');
  now.advance(2000);
  projects.touch(doc);
  assert.equal(createProjects(storage, { now }).active().title, 'Sensor node v2');
});

test('reload merges projects another tab created and keeps a project that tab removed while it is open here', () => {
  const storage = memory();
  const now = clock();
  const a = createProjects(storage, { now });
  const b = createProjects(storage, { now });
  const fromB = b.create('From B');
  a.reload();
  assert.ok(a.list().some(p => p.id === fromB.id));
  a.switchTo(fromB.id);
  b.reload(); b.switchTo('main'); b.remove(fromB.id);
  a.reload();
  assert.equal(a.activeId(), fromB.id, 'the open project stays listed here until this tab leaves it');
});

test('revision histories are per project and rotate independently', async () => {
  const storage = memory();
  const main = createRevisions(storage, { project: 'main' });
  const other = createRevisions(storage, { project: 'p2' });
  main.save(newDoc('Main 1'));
  other.save(newDoc('Other 1'));
  other.save(newDoc('Other 2'));
  assert.deepEqual(main.list().map(r => r.label), ['Main 1']);
  assert.deepEqual(other.list().map(r => r.label), ['Other 2', 'Other 1']);
  assert.equal(createRevisions(storage).list().length, 3, 'no project filter lists every history');
  assert.equal(main.list()[0].project, 'main', 'new entries name their project explicitly');
  await other.purge('p2');
  assert.equal(other.list().length, 0);
  assert.equal(main.list().length, 1);
});
