// Interface language. English is the source of truth: every key is the
// English string itself, and a missing Chinese entry shows English.
// Pure: no DOM. `initI18n` binds the storage; a document, when there is
// one, gets its `lang` attribute updated by setLang.
import zh from './i18n/zh.js';

export const LANGS = ['en', 'zh'];
export const STORAGE_KEY = 'schematica.lang';
const DICTS = { zh };
const HTML_LANG = { en: 'en', zh: 'zh-CN' };

let storage;
let lang = null; // resolved lazily on first getLang()
const listeners = new Set();

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function initI18n({ storage: s = defaultStorage() } = {}) {
  storage = s;
  lang = null;
}

export function getLang() {
  if (lang === null) {
    if (storage === undefined) storage = defaultStorage();
    let stored = null;
    try { stored = storage?.getItem(STORAGE_KEY) ?? null; } catch { stored = null; }
    lang = stored === 'zh' ? 'zh' : 'en';
    applyHtmlLang();
  }
  return lang;
}

function applyHtmlLang() {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = HTML_LANG[lang];
  }
}

export function setLang(next) {
  if (!LANGS.includes(next)) throw new Error(`unknown language "${next}"`);
  if (getLang() === next) return;
  lang = next;
  try { storage?.setItem(STORAGE_KEY, next); } catch { /* blocked storage: the choice lives for this page */ }
  applyHtmlLang();
  for (const fn of [...listeners]) fn(next);
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// tr('{part} added to My parts.', { part }) -> looked up, then filled.
// A placeholder without a value is left as written so a test can see it.
export function tr(text, vars) {
  const key = text == null ? '' : String(text);
  const current = getLang();
  const hit = current === 'en' ? undefined : DICTS[current]?.[key];
  const out = typeof hit === 'string' ? hit : key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// The same lookup for a value read from a data table (a part name, a bus
// name, a preset note), with no placeholder filling. Named separately so the
// coverage test can require that every `tr(` call takes a literal while
// data goes through `trd(`.
export function trd(value) {
  return tr(value);
}
