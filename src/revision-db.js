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
              const all = new Map(req.result.map((e) => [e.id, e]));
              for (const e of entries) all.set(e.id, e);
              const sorted = [...all.values()].sort(
                (a, b) => b.at - a.at || b.id.localeCompare(a.id),
              );
              let bytes = 0;
              sorted.forEach((entry, i) => {
                bytes += JSON.stringify(entry).length * 2;
                if (i && (i >= 30 || bytes > 6 * 1024 * 1024))
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
      resolve({ read, write, close: () => db.close() });
    };
  });
}
