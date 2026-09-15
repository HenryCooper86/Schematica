// Persist document changes only. Selection notifications must neither rewrite
// storage nor postpone a pending save. Page lifecycle events flush immediately.
export function createAutosave({ store, storage, onError = () => {}, delay = 300,
  schedule = setTimeout, cancel = clearTimeout, getDoc = () => store.doc }) {
  let saved = JSON.stringify(getDoc());
  let pending = saved;
  let timer = null;
  let broken = false;

  function flush() {
    if (timer !== null) cancel(timer);
    timer = null;
    pending = JSON.stringify(getDoc());
    if (pending === saved) return;
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem('schematica.autosave', pending);
      saved = pending;
      broken = false;
    } catch (error) {
      if (!broken) onError(error);
      broken = true;
    }
  }

  const unsubscribe = store.subscribe(() => {
    const next = JSON.stringify(getDoc());
    if (next === pending) return;
    pending = next;
    if (timer !== null) cancel(timer);
    timer = schedule(flush, delay);
  });
  return { flush, dispose() { unsubscribe(); flush(); } };
}
