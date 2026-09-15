import { uid } from './state.js';
import { deserialize } from './serialize.js';

export const REVISION_PREFIX = 'schematica.revision.';
const MAX_REVISIONS = 30;
const MAX_BYTES = 6 * 1024 * 1024;

// One immutable key per snapshot: another tab cannot overwrite the index.
export function createRevisions(storage, { onError = () => {} } = {}) {
  const memory = new Map();
  function list() {
    const entries = new Map(memory);
    try {
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(REVISION_PREFIX)) continue;
        try {
          const entry = JSON.parse(storage.getItem(key));
          if (entry?.id && typeof entry.text === 'string' && typeof entry.at === 'number') entries.set(entry.id, entry);
        } catch { /* An unreadable snapshot must not hide the others. */ }
      }
    } catch (error) { onError(error); }
    return [...entries.values()].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  }
  function save(doc, label = doc.title, reason = 'manual') {
    const text = JSON.stringify(doc);
    const entry = { id: uid('rev'), at: Math.max(Date.now(), ...list().map(r => r.at + 1)), label: String(label).slice(0, 200), reason, text };
    memory.set(entry.id, entry);
    try {
      if (!storage) throw new Error('Revision storage unavailable');
      storage.setItem(REVISION_PREFIX + entry.id, JSON.stringify(entry));
    } catch (error) { onError(error); }
    // Keep the newest snapshot even if unusually large. Never delete older
    // durable snapshots to make room for a write that did not succeed.
    const entries = list();
    let bytes = 0;
    entries.forEach((item, index) => {
      bytes += item.text.length * 2;
      if (index && (index >= MAX_REVISIONS || bytes > MAX_BYTES)) {
        memory.delete(item.id);
        try {
          if (storage?.getItem(REVISION_PREFIX + entry.id)) storage.removeItem(REVISION_PREFIX + item.id);
        } catch (error) { onError(error); }
      }
    });
    return entry;
  }
  const restore = id => {
    const entry = list().find(item => item.id === id);
    if (!entry) throw new Error('Revision not found');
    return deserialize(entry.text).doc;
  };
  return { save, list, restore };
}

// Detect another writer before replacing its autosave. The UI decides which
// board to continue; both snapshots are recoverable before that decision.
export function conflictStorage(storage, { getDoc, revisions, onConflict }) {
  const key = 'schematica.autosave';
  let observed = storage?.getItem(key) ?? null;
  let conflict = null;
  function observe(value) {
    if (value === observed) return;
    observed = value;
    try {
      const doc = value ? deserialize(value).doc : null;
      revisions.save(getDoc(), getDoc().title, 'conflict-local');
      if (doc) revisions.save(doc, doc.title, 'conflict-remote');
      conflict = { doc };
      onConflict(conflict);
    } catch { conflict = { doc: null }; onConflict(conflict); }
  }
  return {
    getItem: name => storage?.getItem(name),
    setItem(name, value) {
      if (!storage) throw new Error('Storage unavailable');
      if (name === key) {
        observe(storage.getItem(key));
        if (conflict) throw new Error('Another tab changed this board');
      }
      storage.setItem(name, value);
      if (name === key) observed = value;
    },
    observe,
    resolve() { conflict = null; observed = storage?.getItem(key) ?? null; },
    pending: () => conflict,
  };
}
