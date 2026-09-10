import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, STORAGE_KEY, initI18n, getLang, setLang, onLanguageChange, tr, trd } from '../src/i18n.js';
import zh from '../src/i18n/zh.js';

// A Map-backed stand-in for localStorage.
const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};

test('languages and storage key are fixed', () => {
  assert.deepEqual(LANGS, ['en', 'zh']);
  assert.equal(STORAGE_KEY, 'schematica.lang');
});

test('English is the default for absent, junk, or missing storage', () => {
  initI18n({ storage: fakeStorage() });
  assert.equal(getLang(), 'en');
  initI18n({ storage: fakeStorage({ [STORAGE_KEY]: 'fr' }) });
  assert.equal(getLang(), 'en');
  initI18n({ storage: null });
  assert.equal(getLang(), 'en');
});

test('a stored zh is honoured', () => {
  initI18n({ storage: fakeStorage({ [STORAGE_KEY]: 'zh' }) });
  try {
    assert.equal(getLang(), 'zh');
  } finally {
    initI18n({ storage: fakeStorage() });
  }
});

test('tr passes English through and fills placeholders', () => {
  initI18n({ storage: fakeStorage() });
  assert.equal(tr('Load an example board'), 'Load an example board');
  assert.equal(tr('{part} added to My parts.', { part: 'MCU' }), 'MCU added to My parts.');
  assert.equal(tr('{a} and {a}', { a: 'x' }), 'x and x');
  assert.equal(tr('{missing} stays', {}), '{missing} stays');
  assert.equal(tr(42), '42');
  assert.equal(tr(null), '');
});

test('tr looks up Chinese and falls back to English on a missing key', () => {
  initI18n({ storage: fakeStorage() });
  setLang('zh');
  try {
    assert.equal(tr('Cancel'), zh['Cancel']);
    assert.notEqual(zh['Cancel'], 'Cancel', 'the dictionary has a real entry for Cancel');
    assert.equal(tr('this key does not exist anywhere'), 'this key does not exist anywhere');
    assert.equal(tr('{part} added to My parts.', { part: 'MCU' }), zh['{part} added to My parts.'].replace('{part}', 'MCU'));
  } finally {
    setLang('en');
  }
});

test('trd translates a data value without touching braces', () => {
  initI18n({ storage: fakeStorage() });
  setLang('zh');
  try {
    assert.equal(trd('Compute'), zh['Compute']);
    assert.equal(trd('{not a placeholder}'), '{not a placeholder}');
    assert.equal(trd('unknown data value'), 'unknown data value');
  } finally {
    setLang('en');
  }
});

test('setLang validates, persists, notifies once, and ignores a repeat', () => {
  const storage = fakeStorage();
  initI18n({ storage });
  const seen = [];
  const off = onLanguageChange((lang) => seen.push(lang));
  try {
    setLang('zh');
    assert.equal(getLang(), 'zh');
    assert.equal(storage.getItem(STORAGE_KEY), 'zh');
    setLang('zh');
    assert.deepEqual(seen, ['zh'], 'a repeat is a no-op');
    assert.throws(() => setLang('fr'), /unknown language/);
    assert.equal(getLang(), 'zh');
    setLang('en');
    assert.deepEqual(seen, ['zh', 'en']);
    off();
    setLang('zh');
    assert.deepEqual(seen, ['zh', 'en'], 'unsubscribed');
  } finally {
    setLang('en');
  }
});

test('setLang survives a storage that throws', () => {
  initI18n({ storage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
  try {
    assert.equal(getLang(), 'en');
    setLang('zh');
    assert.equal(getLang(), 'zh');
  } finally {
    setLang('en');
    initI18n({ storage: fakeStorage() });
  }
});

test('the dictionary is a plain object of non-empty strings', () => {
  assert.equal(Object.getPrototypeOf(zh), Object.prototype);
  for (const [k, v] of Object.entries(zh)) {
    assert.equal(typeof v, 'string', k);
    assert.ok(v.trim().length > 0, `empty value for ${k}`);
    // Keys are exact source strings: some begin with a space or a newline.
  }
});
