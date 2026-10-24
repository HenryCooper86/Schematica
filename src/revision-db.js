export const MAX_REVISION_TIME = 8.64e15;
export const validRevision = entry => entry && typeof entry.id === "string" && entry.id.length > 0
  && typeof entry.text === "string" && Number.isFinite(entry.at) && Math.abs(entry.at) <= MAX_REVISION_TIME;

// Rotation and insertion share a transaction: quota errors retain the old store.
export function openRevisionDB(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("schematica-recovery", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("revisions", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Recovery database is blocked by another tab"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const read = () =>
        new Promise((ok, fail) => {
          const tx = db.transaction("revisions");
          const req = tx.objectStore("revisions").getAll();
          tx.oncomplete = () => ok(req.result);
          tx.onabort = tx.onerror = () => fail(tx.error || req.error);
        });
      const write = (entries) =>
        new Promise((ok, fail) => {
          const tx = db.transaction("revisions", "readwrite");
          const store = tx.objectStore("revisions");
          const req = store.getAll();
          req.onsuccess = () => {
            try {
              // Keep malformed records untouched for manual recovery, but do
              // not let their metadata block writes or rotate valid history.
              const all = new Map(req.result.filter(validRevision).map((e) => [e.id, e]));
              for (const e of entries) {
                if (!validRevision(e)) throw new Error("Invalid revision metadata");
                all.set(e.id, e);
              }
              const sorted = [...all.values()].sort(
                (a, b) => b.at - a.at || b.id.localeCompare(a.id),
              );
              // Rotation is per project: one busy board never evicts another's history.
              const counts = new Map();
              sorted.forEach((entry) => {
                const project = entry.project || "main";
                const tally = counts.get(project) || { count: 0, bytes: 0 };
                tally.count += 1; tally.bytes += JSON.stringify(entry).length * 2;
                counts.set(project, tally);
                if (tally.count > 1 && (tally.count > 30 || tally.bytes > 6 * 1024 * 1024))
                  store.delete(entry.id);
                else store.put(entry);
              });
            } catch (error) {
              try {
                tx.abort();
              } catch {
                /* already aborted */
              }
              fail(error);
            }
          };
          tx.oncomplete = () => ok();
          tx.onabort = tx.onerror = () =>
            fail(tx.error || new Error("Recovery write failed"));
        });
      const remove = (match) =>
        new Promise((ok, fail) => {
          const tx = db.transaction("revisions", "readwrite");
          const store = tx.objectStore("revisions");
          const req = store.getAll();
          req.onsuccess = () => { for (const e of req.result) if (match(e)) store.delete(e.id); };
          tx.oncomplete = () => ok();
          tx.onabort = tx.onerror = () => fail(tx.error || new Error("Recovery delete failed"));
        });
      resolve({ read, write, remove, close: () => db.close() });
    };
  });
}
