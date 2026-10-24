import { openRevisionDB, validRevision, MAX_REVISION_TIME } from "./revision-db.js";
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
    project = null,
  } = {},
) {
  const mine = (e) => project === null || (e.project || "main") === project;
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
        if (validRevision(e) && key === REVISION_PREFIX + e.id) entries.push(e);
      } catch {
        /* skip corrupt */
      }
    }
    return entries;
  };
  const refresh = async (persisted = []) => {
    const entries = await db.read();
    durable.clear();
    for (const e of entries) if (validRevision(e)) durable.set(e.id, { ...e, durable: true });
    // Publish the durable list before retiring pending snapshots, so they
    // remain restorable throughout the asynchronous database refresh.
    for (const e of persisted) memory.delete(e.id);
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
        await refresh(entries);
      })
      .catch((error) => {
        onError(error);
        notify();
      });
    return queue;
  }
  function list() {
    const entries = new Map([...durable, ...memory]);
    if (!useDB) {
      try {
        for (const entry of legacy()) entries.set(entry.id, { ...entry, durable: true });
      } catch (error) {
        onError(error);
      }
    }
    return [...entries.values()].filter(mine).sort(
      (a, b) => b.at - a.at || b.id.localeCompare(a.id),
    );
  }
  function persistLocal(entries) {
    if (!entries.length) return;
    let wrote = false;
    for (const entry of entries) {
      try {
        if (!storage) throw new Error("Revision storage unavailable");
        storage.setItem(REVISION_PREFIX + entry.id, JSON.stringify(entry));
        entry.durable = true;
        // Memory holds pending writes only; other writers can rotate storage.
        memory.delete(entry.id);
        wrote = true;
      } catch (error) {
        onError(error);
      }
    }
    // Keep the newest snapshot even if unusually large. Pending snapshots
    // must survive failed writes and never displace older durable snapshots.
    if (wrote) {
      let bytes = 0;
      list().filter(item => item.durable).forEach((item, index) => {
        bytes += item.text.length * 2;
        if (index && (index >= MAX_REVISIONS || bytes > MAX_BYTES)) {
          try {
            storage.removeItem(REVISION_PREFIX + item.id);
          } catch (error) {
            onError(error);
          }
        }
      });
    }
    notify();
  }
  function save(doc, label = doc.title, reason = "manual") {
    const text = JSON.stringify(doc);
    const entry = {
      id: uid("rev"),
      at: Math.min(MAX_REVISION_TIME, Math.max(Date.now(), ...list().map((r) => r.at + 1))),
      label: String(label).slice(0, 200),
      reason,
      text,
      durable: false,
      ...(project ? { project } : {}),
    };
    memory.set(entry.id, entry);
    if (useDB) {
      notify();
      persist();
      return entry;
    }
    persistLocal([entry]);
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
    // Remove every snapshot of one project; the caller has confirmed.
    purge(id) {
      for (const e of [...durable.values(), ...memory.values()]) if ((e.project || "main") === id) { durable.delete(e.id); memory.delete(e.id); }
      if (!useDB) {
        try { for (const e of legacy()) if ((e.project || "main") === id) storage.removeItem(REVISION_PREFIX + e.id); } catch (error) { onError(error); }
        notify();
        return Promise.resolve();
      }
      queue = queue.then(async () => { await ready; if (!db) db = database || await openRevisionDB(indexedDB); if (db.remove) await db.remove(e => (e.project || "main") === id); await refresh(); }).catch((error) => { onError(error); notify(); });
      return queue;
    },
    retry: () => (useDB ? persist() : Promise.resolve(persistLocal([...memory.values()]))),
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
export function conflictStorage(storage, { getDoc, revisions, onConflict, key = "schematica.autosave" }) {
  let observed = storage?.getItem(key) ?? null;
  let conflict = null;
  function observe(value) {
    if (value === observed) return;
    observed = value;
    try {
      const local = getDoc();
      revisions.save(local, local.title, "conflict-local");
      const doc = value ? deserialize(value).doc : null;
      if (doc) revisions.save(doc, doc.title, "conflict-remote");
      conflict = { doc };
      onConflict(conflict);
    } catch {
      conflict = { doc: null };
      onConflict(conflict);
    }
  }
  return {
    key,
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
      const current = storage?.getItem(key) ?? null;
      if (current !== observed) {
        observe(current);
        throw new Error("Another tab changed this board");
      }
      conflict = null;
    },
    pending: () => conflict,
  };
}
