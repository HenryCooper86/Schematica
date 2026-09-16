import { openRevisionDB } from "./revision-db.js";
import { uid } from "./state.js";
import { deserialize } from "./serialize.js";

export const REVISION_PREFIX = "schematica.revision.";
const MAX_REVISIONS = 30;
const MAX_BYTES = 6 * 1024 * 1024;

// One immutable key per snapshot: another tab cannot overwrite the index.
export function createRevisions(
  storage,
  {
    onError = () => {},
    indexedDB = null,
    database = null,
    onChange = () => {},
  } = {},
) {
  const memory = new Map();
  const durable = new Map();
  const listeners = new Set([onChange]);
  const notify = () => listeners.forEach((fn) => fn());
  const useDB = !!(indexedDB || database);
  let db = null,
    queue = Promise.resolve();
  const legacy = () => {
    const entries = [];
    for (let i = 0; storage && i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(REVISION_PREFIX)) continue;
      try {
        const e = JSON.parse(storage.getItem(key));
        if (e?.id && typeof e.text === "string") entries.push(e);
      } catch {
        /* skip corrupt */
      }
    }
    return entries;
  };
  const refresh = async () => {
    const entries = await db.read();
    durable.clear();
    for (const e of entries) durable.set(e.id, { ...e, durable: true });
    notify();
  };
  const ready = useDB
    ? (async () => {
        try {
          const old = legacy();
          for (const e of old) durable.set(e.id, { ...e, durable: true });
          db = database || (await openRevisionDB(indexedDB));
          if (old.length) {
            await db.write(old);
            // The transaction succeeded, including bounded rotation.
            for (const e of old) storage.removeItem(REVISION_PREFIX + e.id);
          }
          await refresh();
        } catch (error) {
          onError(error);
          notify();
        }
      })()
    : Promise.resolve();
  function persist() {
    queue = queue
      .then(async () => {
        await ready;
        if (!db) db = database || await openRevisionDB(indexedDB);
        const old = legacy();
        const entries = [...memory.values()].map(({ durable, ...e }) => e);
        if (entries.length || old.length) await db.write([...old, ...entries]);
        for (const e of old) storage.removeItem(REVISION_PREFIX + e.id);
        for (const e of entries) memory.delete(e.id);
        await refresh();
      })
      .catch((error) => {
        onError(error);
        notify();
      });
    return queue;
  }
  function list() {
    const entries = new Map([...durable, ...memory]);
    if (useDB)
      return [...entries.values()].sort(
        (a, b) => b.at - a.at || b.id.localeCompare(a.id),
      );
    try {
      for (let i = 0; storage && i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(REVISION_PREFIX)) continue;
        try {
          const entry = JSON.parse(storage.getItem(key));
          if (
            entry?.id &&
            typeof entry.text === "string" &&
            typeof entry.at === "number"
          )
            entries.set(entry.id, { ...entry, durable: true });
        } catch {
          /* An unreadable snapshot must not hide the others. */
        }
      }
    } catch (error) {
      onError(error);
    }
    return [...entries.values()].sort(
      (a, b) => b.at - a.at || b.id.localeCompare(a.id),
    );
  }
  function save(doc, label = doc.title, reason = "manual") {
    const text = JSON.stringify(doc);
    const entry = {
      id: uid("rev"),
      at: Math.max(Date.now(), ...list().map((r) => r.at + 1)),
      label: String(label).slice(0, 200),
      reason,
      text,
      durable: false,
    };
    memory.set(entry.id, entry);
    if (useDB) {
      notify();
      persist();
      return entry;
    }
    try {
      if (!storage) throw new Error("Revision storage unavailable");
      storage.setItem(REVISION_PREFIX + entry.id, JSON.stringify(entry));
      entry.durable = true;
    } catch (error) {
      onError(error);
    }
    // Keep the newest snapshot even if unusually large. Never delete older
    // durable snapshots to make room for a write that did not succeed.
    const entries = list();
    let bytes = 0;
    entries.forEach((item, index) => {
      bytes += item.text.length * 2;
      if (index && (index >= MAX_REVISIONS || bytes > MAX_BYTES)) {
        memory.delete(item.id);
        try {
          if (storage?.getItem(REVISION_PREFIX + entry.id))
            storage.removeItem(REVISION_PREFIX + item.id);
        } catch (error) {
          onError(error);
        }
      }
    });
    notify();
    return entry;
  }
  const restore = (id) => {
    const entry = list().find((item) => item.id === id);
    if (!entry) throw new Error("Revision not found");
    return deserialize(entry.text).doc;
  };
  return {
    save,
    list,
    restore,
    ready,
    flush: () => queue,
    retry: () => (useDB ? persist() : Promise.resolve()),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh: async () => {
      await ready;
      if (db) await refresh();
    },
  };
}

// Detect another writer before replacing its autosave. The UI decides which
// board to continue; both snapshots are recoverable before that decision.
export function conflictStorage(storage, { getDoc, revisions, onConflict }) {
  const key = "schematica.autosave";
  let observed = storage?.getItem(key) ?? null;
  let conflict = null;
  function observe(value) {
    if (value === observed) return;
    observed = value;
    try {
      const doc = value ? deserialize(value).doc : null;
      revisions.save(getDoc(), getDoc().title, "conflict-local");
      if (doc) revisions.save(doc, doc.title, "conflict-remote");
      conflict = { doc };
      onConflict(conflict);
    } catch {
      conflict = { doc: null };
      onConflict(conflict);
    }
  }
  return {
    getItem: (name) => storage?.getItem(name),
    setItem(name, value) {
      if (!storage) throw new Error("Storage unavailable");
      if (name === key) {
        observe(storage.getItem(key));
        if (conflict) throw new Error("Another tab changed this board");
      }
      storage.setItem(name, value);
      if (name === key) observed = value;
    },
    observe,
    resolve() {
      conflict = null;
      observed = storage?.getItem(key) ?? null;
    },
    pending: () => conflict,
  };
}
