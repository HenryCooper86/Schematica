import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, LIBRARY_KEY, EXPORT_MARK } from '../src/library.js';
import { LIMITS } from '../src/custom.js';
import { initI18n, setLang } from '../src/i18n.js';

function mapStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
}

const DEF = { name: 'Motor driver x4', category: 'actuators', ports: [{ name: 'CAN', side: 'left', bus: 'can' }] };

test('save adds a normalized template with an id and a timestamp; list and get return clones', () => {
  const storage = mapStorage();
  const lib = createLibrary(storage);
  assert.deepEqual(lib.list(), []);
  const id = lib.save({ ...DEF, lib: 'ignored' });
  assert.match(id, /^lp[0-9a-z]{12}$/);
  const [t] = lib.list();
  assert.equal(t.id, id);
  assert.equal(t.name, 'Motor driver x4');
  assert.equal(t.ports[0].id, 'p1');
  assert.equal('lib' in t, false, 'a template never carries lib');
  assert.match(t.updated, /^\d{4}-\d{2}-\d{2}T/);
  t.name = 'mutated';
  assert.equal(lib.get(id).name, 'Motor driver x4', 'clones');
  assert.equal(lib.get('nope'), null);
  assert.ok(storage.map.get(LIBRARY_KEY).includes('"version":1'));
});

test('save with an id replaces, or creates under that id; remove returns the entry; subscribers hear every change', () => {
  const lib = createLibrary(mapStorage());
  let calls = 0;
  const off = lib.subscribe(() => { calls += 1; });
  const id = lib.save(DEF);
  assert.equal(lib.save({ ...DEF, name: 'Renamed' }, id), id);
  assert.equal(lib.list().length, 1);
  assert.equal(lib.get(id).name, 'Renamed');
  assert.equal(lib.save(DEF, 'lp-given'), 'lp-given', 'an unknown id is created as given');
  const gone = lib.remove(id);
  assert.equal(gone.name, 'Renamed');
  assert.equal(lib.remove(id), null);
  assert.deepEqual(lib.list().map((t) => t.id), ['lp-given']);
  assert.equal(calls, 4);
  off();
  lib.save(DEF);
  assert.equal(calls, 4);
});

test('save refuses a nameless definition and a full library', () => {
  const lib = createLibrary(mapStorage());
  assert.throws(() => lib.save({ name: '' }), /no name/);
  for (let i = 0; i < LIMITS.library; i++) lib.save({ ...DEF, name: `P${i}` });
  assert.throws(() => lib.save(DEF), /full/);
  assert.equal(lib.list().length, LIMITS.library);
  assert.doesNotThrow(() => lib.save({ ...DEF, name: 'replace' }, lib.list()[0].id), 'replacing never needs room');
  const lib2 = createLibrary(mapStorage());
  assert.throws(() => lib2.save(DEF, 'bad id with space'), /Invalid template id/);
  assert.throws(() => lib2.save(DEF, 'x'.repeat(41)), /Invalid template id/);
  assert.equal(lib2.list().length, 0, 'list unchanged after invalid id attempts');
  assert.equal(lib2.save(DEF, 'ok-id_1'), 'ok-id_1', 'valid id still creates as given');
  assert.equal(lib2.list().length, 1, 'valid id entry was created');
});

test('corrupt or foreign storage reads as empty; blocked storage falls back to memory', () => {
  const corrupt = mapStorage();
  corrupt.setItem(LIBRARY_KEY, '{nope');
  assert.deepEqual(createLibrary(corrupt).list(), []);
  const foreign = mapStorage();
  foreign.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, parts: [{ id: 'bad id', name: 'x' }, { id: 'ok', name: 'Ok' }, { id: 'ok', name: 'Dup' }, 'junk'] }));
  assert.deepEqual(createLibrary(foreign).list().map((t) => [t.id, t.name]), [['ok', 'Ok']], 'bad ids, duplicates, and junk are skipped');
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const lib = createLibrary(blocked);
  const id = lib.save(DEF);
  assert.equal(lib.get(id).name, 'Motor driver x4', 'lives in memory for the session');
  const none = createLibrary(null);
  none.save(DEF);
  assert.equal(none.list().length, 1);
});

test('export and import round-trip; import merges by id, adds the rest, skips junk with warnings', () => {
  const a = createLibrary(mapStorage());
  const id = a.save(DEF);
  a.save({ ...DEF, name: 'Fan' });
  const text = a.exportJSON();
  const parsed = JSON.parse(text);
  assert.equal(parsed[EXPORT_MARK], 1);
  assert.equal(parsed.parts.length, 2);
  const b = createLibrary(mapStorage());
  b.save({ ...DEF, name: 'Old driver' }, id);
  b.save({ ...DEF, name: 'Mine' });
  const res = b.importJSON(text);
  assert.deepEqual([res.added, res.replaced], [1, 1]);
  assert.equal(b.get(id).name, 'Motor driver x4', 'same id replaced');
  assert.equal(b.list().length, 3);
  const junk = b.importJSON(JSON.stringify({ schematicaParts: 1, parts: [{ name: '' }, { id: 'z', name: 'Z', ports: [{ name: 'X', side: 'nowhere', bus: 'gpio' }] }] }));
  assert.deepEqual([junk.added, junk.replaced], [1, 0]);
  assert.ok(junk.warnings.some((w) => /Entry 1/.test(w)));
  assert.ok(junk.warnings.some((w) => /Entry 2/.test(w) && /no name or side/.test(w)));
  assert.throws(() => b.importJSON('{nope'), /could not parse/);
  assert.throws(() => b.importJSON('{"parts": 5}'), /Not a parts file/);
});

test('import demands the export mark the error message names', () => {
  const lib = createLibrary(mapStorage());
  // A board file, or any other JSON that happens to carry a "parts" list, is
  // not a parts file however well-formed its entries are.
  assert.throws(
    () => lib.importJSON(JSON.stringify({ schema: 2, parts: [{ id: 'z', name: 'Z' }] })),
    new RegExp(`Not a parts file: expected .*${EXPORT_MARK}`),
  );
  assert.equal(lib.list().length, 0, 'nothing was merged from the rejected file');
  const marked = lib.importJSON(JSON.stringify({ [EXPORT_MARK]: 1, parts: [{ id: 'z', name: 'Z' }] }));
  assert.deepEqual([marked.added, marked.replaced], [1, 0], 'the mark is all it takes');
  assert.doesNotThrow(() => lib.importJSON(lib.exportJSON()), 'our own export always passes');
});

test('library errors and import warnings come out in Chinese under zh', () => {
  initI18n({ storage: null });
  const lib = createLibrary(mapStorage());
  assert.throws(() => lib.save({ name: '' }), /The part cannot be saved/);
  setLang('zh');
  try {
    assert.throws(() => lib.save({ name: '' }), /无法保存该部件/);
    assert.throws(() => lib.save(DEF, 'bad id'), /模板 ID 无效。/);
    assert.throws(() => lib.importJSON('{nope'), /不是部件文件：无法解析 JSON。/);
    assert.throws(() => lib.importJSON('{"parts": []}'), /不是部件文件/);
    const res = lib.importJSON(JSON.stringify({ [EXPORT_MARK]: 1, parts: [{ name: '' }] }));
    assert.match(res.warnings[0], /^条目 1：/);
  } finally {
    setLang('en');
  }
});
