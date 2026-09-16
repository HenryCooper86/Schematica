import { Store } from "../state.js";
import { impactAnalysis } from "../impact.js";
import { compareBoards } from "../compare.js";
import { checkDoc } from "../drc.js";

// Requests execute against this isolated store, including their analysis tools.
export function createEditPreview(store) {
  const original = JSON.stringify(store.doc),
    generation = store.generation;
  const draft = new Store(structuredClone(store.doc));
  let closed = false;
  const stale = () =>
    closed ||
    store.generation !== generation ||
    JSON.stringify(store.doc) !== original ||
    store._batchSnap !== null;
  return {
    draft,
    stale,
    changed: () => JSON.stringify(draft.doc) !== original,
    summary: () => ({
      comparison: compareBoards(JSON.parse(original), draft.doc),
      impact: impactAnalysis(JSON.parse(original), draft.doc),
      before: checkDoc(JSON.parse(original)),
      after: checkDoc(draft.doc),
    }),
    discard() {
      closed = true;
    },
    apply() {
      if (stale())
        throw new Error(
          "The board changed. Generate a new preview before applying.",
        );
      const next = structuredClone(draft.doc);
      store.apply((doc) => {
        for (const key of Object.keys(doc)) delete doc[key];
        Object.assign(doc, next);
      });
      closed = true;
      store.setSelection(
        [...store.selection].filter((id) =>
          [...next.nodes, ...next.wires, ...next.notes, ...next.zones].some(
            (i) => i.id === id,
          ),
        ),
      );
    },
  };
}
