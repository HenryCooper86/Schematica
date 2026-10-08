import { BUSES, BUS_ORDER } from './buses.js';
import { nodePart } from './rdk/profiles.js';
import { addWire } from './state.js';
import { tr } from './i18n.js';

export const connectionSnapshot = store => ({ generation: store.generation, snapshot: JSON.stringify(store.doc) });

function endpoint(doc, ref) {
  const node = doc.nodes.find(n => n.id === ref?.node);
  const port = node && nodePart(node).ports.find(p => p.id === ref?.port);
  if (!node || !port || !Object.hasOwn(BUSES, port.bus))
    throw new Error(tr('Choose existing endpoints with supported ports.'));
  return port;
}

export function connectionOptions(doc, from, to) {
  const a = endpoint(doc, from), b = endpoint(doc, to);
  if (from.node === to.node) throw new Error(tr('Choose ports on two different parts.'));
  // Match the pointer workflow: matching ports fix the bus; different buses
  // offer the endpoint suggestions first, followed by all known bus types.
  return a.bus === b.bus ? [a.bus] : [...new Set([a.bus, b.bus, ...BUS_ORDER])];
}

export function connectPorts(store, { from, to, bus }, pending) {
  if (!pending || pending.generation !== store.generation || pending.snapshot !== JSON.stringify(store.doc) || store.inBatch())
    throw new Error(tr('The board changed. Reopen the connection dialog.'));
  if (!connectionOptions(store.doc, from, to).includes(bus))
    throw new Error(tr('Choose a supported bus for these ports.'));
  return addWire(store, bus, { node: from.node, port: from.port }, { node: to.node, port: to.port });
}
