import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';
import { EXAMPLES } from '../src/examples.js';
import { connectionOptions, connectPorts, connectionSnapshot } from '../src/connections.js';

const setup = () => new Store(structuredClone(EXAMPLES.find(e => e.id === 'declared-uart-reference').doc));
const from = { node: 'n1', port: 'left' }, to = { node: 'n5', port: 'right' };

test('connection choices use actual ports and select their shared bus', () => {
  const store = setup();
  assert.deepEqual(connectionOptions(store.doc, from, to), ['uart']);
  const id = connectPorts(store, { from, to, bus: 'uart' }, connectionSnapshot(store));
  assert.deepEqual(store.doc.wires.at(-1).from, from);
  assert.equal(store.doc.wires.at(-1).id, id);
  assert.equal(store.doc.wires.at(-1).spec, undefined, 'no electrical assumptions are invented');
  assert.equal(store.undoStack.length, 1);
  store.undo();
  assert.equal(store.doc.wires.length, 4);
  store.redo();
  assert.equal(store.doc.wires.length, 5);
});

test('different known buses require an explicit existing bus choice', () => {
  const store = setup();
  store.doc.nodes[4].part.ports[1].bus = 'spi';
  const options = connectionOptions(store.doc, from, to);
  assert.ok(options.includes('uart') && options.includes('spi') && options.includes('i2c'));
  assert.throws(() => connectPorts(store, { from, to, bus: '' }, connectionSnapshot(store)));
  connectPorts(store, { from, to, bus: 'spi' }, connectionSnapshot(store));
  assert.equal(store.doc.wires.at(-1).bus, 'spi');
});

test('locked positions still allow a connection, matching pointer editing', () => {
  const store = setup();
  store.doc.nodes[0].locked = true;
  store.doc.nodes[4].locked = true;
  const positions = store.doc.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
  assert.deepEqual(connectionOptions(store.doc, from, to), ['uart']);
  connectPorts(store, { from, to, bus: 'uart' }, connectionSnapshot(store));
  assert.equal(store.doc.wires.length, 5);
  assert.deepEqual(store.doc.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })), positions);
  store.undo();
  assert.equal(store.doc.wires.length, 4);
  assert.equal(store.doc.nodes[0].locked, true);
});

for (const change of ['missing node', 'missing port', 'unsupported port', 'unsupported bus', 'self-loop', 'stale edit', 'stale replace']) {
  test(`keyboard connection rejects ${change} without mutation`, () => {
    const store = setup();
    let snapshot = connectionSnapshot(store);
    const draft = { from: { ...from }, to: { ...to }, bus: 'uart' };
    if (change === 'missing node') draft.from.node = 'missing';
    if (change === 'missing port') draft.from.port = 'missing';
    if (change === 'unsupported port') store.doc.nodes[0].part.ports[0].bus = 'unsupported';
    if (change === 'unsupported bus') draft.bus = 'unsupported';
    if (change === 'self-loop') draft.to = { node: 'n1', port: 'right' };
    if (change === 'stale edit') store.apply(doc => { doc.title = 'Changed'; });
    if (change === 'stale replace') store.replaceDoc(structuredClone(store.doc));
    if (!change.startsWith('stale')) snapshot = connectionSnapshot(store);
    const before = structuredClone(store.doc), history = store.undoStack.length;
    assert.throws(() => connectPorts(store, draft, snapshot));
    assert.deepEqual(store.doc, before);
    assert.equal(store.undoStack.length, history);
  });
}
