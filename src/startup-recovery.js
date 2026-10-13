import { deserialize } from './serialize.js';
import { uid } from './state.js';
import { tr } from './i18n.js';

// Original bytes live outside the rotating, normalized revision history.
export const RECOVERY_PREFIX = 'schematica.recovery.';
const AUTOSAVE = 'schematica.autosave';
const inspect = text => {
  try { return { ...deserialize(text), error: '' }; }
  catch (error) { return { doc: null, warnings: [], error: error.message }; }
};
export function createStartupRecovery(storage) {
  const entries = new Map(), listeners = new Set();
  const notify = () => listeners.forEach(fn => fn());
  let original = null, doc = null, readError = '';
  function refresh() {
    try {
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(RECOVERY_PREFIX)) continue;
        try {
          const entry = JSON.parse(storage.getItem(key));
          if (entry?.id && key === RECOVERY_PREFIX + entry.id && typeof entry.text === 'string' && Number.isFinite(entry.at)) {
            const known = entries.get(entry.id);
            if (known && known.text !== entry.text) { known.durable = false; continue; }
            const { warnings, error } = inspect(entry.text);
            entries.set(entry.id, Object.assign(entries.get(entry.id) || {}, { id: entry.id, at: entry.at, text: entry.text, reviewed: entry.reviewed === true, warnings, error, durable: true }));
          }
        } catch { /* An unreadable archive must not hide the current original. */ }
      }
    } catch { /* Current startup data is still guarded if enumeration fails. */ }
  }
  function preserve(entry) {
    const wasDurable = entry.durable;
    try {
      if (!storage) throw Error('Storage unavailable');
      const key = RECOVERY_PREFIX + entry.id;
      const existing = storage.getItem(key);
      if (existing !== null) {
        const saved = JSON.parse(existing);
        if (saved.text !== entry.text) throw Error('Recovery copy differs');
        entry.reviewed = saved.reviewed === true;
      } else {
        storage.setItem(key, JSON.stringify({ id: entry.id, at: entry.at, text: entry.text, reviewed: entry.reviewed }));
      }
      entry.durable = true;
    } catch { entry.durable = false; }
    if (entry.durable !== wasDurable) notify();
    return entry.durable;
  }
  function readStartup(retrying = false) {
    try {
      if (!storage) throw Error('Storage unavailable');
      const text = storage.getItem(AUTOSAVE);
      if (text !== null) {
        const result = inspect(text);
        if (!retrying) doc = result.doc;
        if (retrying || result.error || result.warnings.length) {
          original = [...entries.values()].find(entry => entry.text === text);
          if (!original) {
            original = { id: uid('raw'), at: Date.now(), text, warnings: result.warnings, error: result.error, reviewed: false, durable: false };
            entries.set(original.id, original);
          }
          preserve(original);
        }
      }
      readError = '';
    } catch { readError = tr('Saved board storage could not be read. Export your work before closing this tab.'); }
  }
  refresh(); readStartup();
  return {
    doc,
    get readError() { return readError; },
    blocked: () => !!readError || !!original && !original.durable,
    list: () => [...entries.values()].sort((a, b) => b.at - a.at),
    pending: () => !!readError || [...entries.values()].some(entry => !entry.reviewed || !entry.durable),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh() { refresh(); notify(); },
    retry() { if (readError) readStartup(true); for (const entry of entries.values()) preserve(entry); notify(); },
    acknowledge(id) {
      const entry = entries.get(id);
      if (!entry || !preserve(entry)) throw Error(tr('The original autosave must be preserved before marking it reviewed.'));
      storage.setItem(RECOVERY_PREFIX + id, JSON.stringify({ id: entry.id, at: entry.at, text: entry.text, reviewed: true }));
      entry.reviewed = true; notify();
    },
    protect(target) {
      return {
        getItem: key => target.getItem(key),
        setItem(key, value) {
          if (key === AUTOSAVE && (readError || (original && !preserve(original)))) {
            throw Error(tr('Autosave is paused to protect the original data. Export your current board or retry recovery.'));
          }
          target.setItem(key, value);
        },
      };
    },
  };
}
