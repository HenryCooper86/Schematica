// The personal library of custom part definitions: the templates the
// palette lists under "My parts". Stored in this browser under one key,
// with an in-memory fallback when storage is blocked (the same tolerance
// the assistant settings have). Storage is injected so tests pass a Map.
import { normalizePart, LIMITS } from './custom.js';
import { uid } from './state.js';
import { tr } from './i18n.js';

export const LIBRARY_KEY = 'schematica.parts';
export const EXPORT_MARK = 'schematicaParts';
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function createLibrary(storage) {
  const read = () => { try { return storage ? storage.getItem(LIBRARY_KEY) : null; } catch { return null; } };
  let memory = null; // the list, once storage has failed us
  const listeners = new Set();

  // Every read re-parses storage (another tab may have written), and every
  // entry goes through the validator, so a foreign or corrupt value can only
  // yield fewer templates, never a broken one.
  function load() {
    if (memory) return memory;
    let parsed = null;
    try { parsed = JSON.parse(read() || 'null'); } catch { parsed = null; }
    const raw = Array.isArray(parsed?.parts) ? parsed.parts : [];
    const out = [];
    for (const entry of raw) {
      const id = typeof entry?.id === 'string' && ID_RE.test(entry.id) ? entry.id : null;
      const { part } = normalizePart(entry);
      if (!id || !part || out.some((t) => t.id === id)) continue;
      delete part.lib;
      out.push({ id, ...part, updated: typeof entry.updated === 'string' ? entry.updated : '' });
    }
    return out.slice(0, LIMITS.library);
  }

  function persist(parts) {
    let stored = false;
    try {
      if (storage) { storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, parts })); stored = true; }
    } catch { /* blocked or full: keep the session's copy in memory */ }
    memory = stored ? null : parts;
    for (const fn of listeners) fn();
  }

  const list = () => load().map((t) => structuredClone(t));
  const get = (id) => {
    const t = load().find((x) => x.id === id);
    return t ? structuredClone(t) : null;
  };

  // Saves a definition as a template: under `id` when given (replacing an
  // existing one, or creating it under that id), else as a new one.
  // Returns the id. Throws when the library is full or the part has no name.
  function save(def, id = null) {
    const { part, warnings } = normalizePart(def);
    if (!part) throw new Error(tr('The part cannot be saved: {reasons}', { reasons: warnings.join(' ') }));
    if (id && !ID_RE.test(id)) throw new Error(tr('Invalid template id.'));
    delete part.lib;
    const parts = load();
    const at = id ? parts.findIndex((t) => t.id === id) : -1;
    if (at < 0 && parts.length >= LIMITS.library) throw new Error(tr('My parts is full ({max} templates).', { max: LIMITS.library }));
    const entry = { id: at >= 0 ? id : (id || uid('lp')), ...part, updated: new Date().toISOString() };
    if (at >= 0) parts[at] = entry;
    else parts.push(entry);
    persist(parts);
    return entry.id;
  }

  function remove(id) {
    const parts = load();
    const at = parts.findIndex((t) => t.id === id);
    if (at < 0) return null;
    const [gone] = parts.splice(at, 1);
    persist(parts);
    return gone;
  }

  const exportJSON = () => JSON.stringify({ [EXPORT_MARK]: 1, parts: load() }, null, 2);

  // Merges a parts file: the same id replaces, a new id adds, an unusable
  // entry is skipped with a warning. Throws when the text is not a parts file:
  // the export mark tells a parts file from a board or any other JSON that
  // happens to carry a "parts" list.
  function importJSON(text) {
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error(tr('Not a parts file: could not parse JSON.')); }
    if (!raw || typeof raw !== 'object' || !raw[EXPORT_MARK] || !Array.isArray(raw.parts)) {
      throw new Error(tr('Not a parts file: expected { "{mark}": 1, "parts": [...] }.', { mark: EXPORT_MARK }));
    }
    const parts = load();
    const warnings = [];
    let added = 0;
    let replaced = 0;
    raw.parts.forEach((entry, i) => {
      const { part, warnings: w } = normalizePart(entry);
      if (!part) { warnings.push(tr('Entry {n}: {text}', { n: i + 1, text: w.join(' ') })); return; }
      warnings.push(...w.map((x) => tr('Entry {n}: {text}', { n: i + 1, text: x })));
      delete part.lib;
      const id = typeof entry.id === 'string' && ID_RE.test(entry.id) ? entry.id : uid('lp');
      const item = { id, ...part, updated: typeof entry.updated === 'string' ? entry.updated : new Date().toISOString() };
      const at = parts.findIndex((t) => t.id === id);
      if (at >= 0) { parts[at] = item; replaced += 1; }
      else if (parts.length >= LIMITS.library) warnings.push(tr('Entry {n}: My parts is full; skipped.', { n: i + 1 }));
      else { parts.push(item); added += 1; }
    });
    persist(parts);
    return { added, replaced, warnings };
  }

  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  return { list, get, save, remove, importJSON, exportJSON, subscribe };
}
