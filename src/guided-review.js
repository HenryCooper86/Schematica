import { REFERENCE_EXAMPLE } from './examples-reference.js';
import { serialize, deserialize } from './serialize.js';
import { isLocked } from './state.js';
import { tr } from './i18n.js';

const snapshot = doc => JSON.stringify(doc);

// Save an immutable root snapshot, including an otherwise empty board's title
// and engineering records. Both asynchronous boundaries must retain the board
// and avoid a live batch, even before a pointer drag has changed any content.
export async function loadGuideBoard({ store, rootDoc, revisions, doc }) {
  const generation = store.generation, before = snapshot(rootDoc());
  const assertCurrent = () => {
    if (store.inBatch() || store.generation !== generation || snapshot(rootDoc()) !== before)
      throw new Error(tr('The board changed. Preview again before applying.'));
  };
  assertCurrent();
  const next = deserialize(serialize(doc)).doc;
  await revisions.ready;
  assertCurrent();
  const saved = revisions.save(JSON.parse(before), JSON.parse(before).title, 'before-guide');
  await revisions.flush();
  assertCurrent();
  if (!revisions.list().some(r => r.id === saved.id && r.durable))
    throw new Error(tr('Save the current board to a file before loading the starter.'));
  store.replaceDoc(next);
}

export function walkthroughSession(store, expected = REFERENCE_EXAMPLE.doc) {
  // Normalization may reorder object properties when the example is loaded.
  // Compare normalized copies; keep the actual snapshot for later stale checks.
  if (serialize(deserialize(serialize(store.doc)).doc) !== serialize(deserialize(serialize(expected)).doc))
    throw new Error(tr('Load the UART walkthrough before introducing a mismatch.'));
  return { generation: store.generation, snapshot: snapshot(store.doc) };
}

export function introduceMismatch(store, session) {
  if (!session || store.generation !== session.generation || snapshot(store.doc) !== session.snapshot || store.inBatch())
    throw new Error(tr('The walkthrough board changed. Reload the walkthrough to try the mismatch.'));
  const wire = store.doc.wires.find(w => w.id === 'w1');
  const target = store.doc.nodes.find(n => n.id === wire?.to.node);
  const origin = store.doc.nodes.find(n => n.id === wire?.from.node);
  if (!wire || wire.bus !== 'uart' || isLocked(target) || isLocked(origin) || !target?.interfacePorts?.[wire.to.port])
    throw new Error(tr('The walkthrough connection is missing or locked.'));
  store.apply(doc => { doc.nodes.find(n => n.id === target.id).interfacePorts[wire.to.port].rateBps = 9600; });
  store.setSelection([wire.id]);
}
