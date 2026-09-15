import { buildClip, encodeClip, readClip, pasteInto, clipCount, copiedMessage, pastedMessage, MAX_CLIP_ITEMS, pasteOffsetInfo } from '../clipboard.js';
import { deleteItems, lockedKeptMessage } from '../state.js';
import { tr } from '../i18n.js';

export function createClipboardCommands({ store, library, canEditNow, notify, clipboard = () => globalThis.navigator?.clipboard }) {
  // ---- Copy, cut, paste ----
  // The payload itself is built and validated in src/clipboard.js; this layer
  // is only the clipboard API, the toasts, and the guards.

  // What this tab copied last. A browser that denies the clipboard (a file://
  // page, a denied permission, no secure context) still gets copy and paste
  // within the tab, the way the PNG copy falls back to a download.
  let memoryClip = null;

  // Read-only view of the part library, to tell a pasted custom card whose
  // template id this browser already knows from one it has never seen. A
  // caller that has no library (a test, say) simply finds nothing.
  const templates = library || { get: () => null };

  // A dialog or a mid-request assistant may take the board over while the
  // clipboard read is in flight; a paste that landed after that would edit a
  // board the user is no longer driving.
  async function copySelection({ cut = false } = {}) {
    const copiedIds = [...store.selection];
    const copiedGeneration = store.generation;
    const clip = buildClip(store.doc, copiedIds);
    if (!clip) {
      notify(tr('Select a part, zone, or note to copy.'));
      return;
    }
    const n = clipCount(clip);
    if (n > MAX_CLIP_ITEMS) {
      notify(tr('A copy is limited to {max} items; this selection holds {n}.', { max: MAX_CLIP_ITEMS, n }));
      return;
    }
    const text = encodeClip(clip);
    memoryClip = text;
    // Still inside the keypress, so the write carries its user activation.
    const api = clipboard();
    let shared = false;
    if (api?.writeText) {
      try {
        await api.writeText(text);
        shared = true;
      } catch { /* denied: the in-tab copy above is the fallback */ }
    }
    // A locked item is copied but never removed, and is counted the way Delete
    // counts it. A dialog or an assistant request that took the board over
    // while the write was in flight removes nothing, so the notice says copied.
    const removed = cut && canEditNow() && store.generation === copiedGeneration;
    const kept = removed ? lockedKeptMessage(deleteItems(store, copiedIds).kept) : null;
    notify([
      copiedMessage(n, { cut: removed }),
      kept,
      shared ? null : tr('The clipboard was blocked, so this copy stays in this tab.'),
    ].filter(Boolean).join(' '));
  }

  async function pasteClipboard() {
    const generation = store.generation;
    const api = clipboard();
    let text = null;
    if (api?.readText) {
      try { text = await api.readText(); } catch { text = null; }
    }
    // A denied or empty read falls back to this tab's own copy; text that was
    // read successfully is used as it is, so a paste never resurrects an
    // older copy over what the user has since put on the clipboard.
    if (!text) text = memoryClip;
    if (!canEditNow() || store.generation !== generation) return;
    let clip;
    let warnings;
    try {
      ({ clip, warnings } = readClip(text));
    } catch (err) {
      notify(err.message);
      return;
    }
    const pasteInfo = pasteOffsetInfo(store.doc, clip);
    const ids = pasteInto(store, clip, {
      templateFor: (lib) => templates.get(lib),
      offset: pasteInfo.offset,
    });
    store.setSelection(ids);
    const list = [...warnings];
    if (pasteInfo.saturated) {
      list.push(tr('Paste area was crowded; some pasted items may overlap.'));
    }
    notify(list.length
      ? tr('Pasted with warnings:\n\n{list}', { list: list.join('\n') })
      : pastedMessage(ids.length));
  }

  return { copySelection, pasteClipboard };
}
