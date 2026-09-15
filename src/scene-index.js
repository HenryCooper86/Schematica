import { nodeRect, wireLanes } from './geometry.js';

// Rebuilt for each render, so mutation and undo need no cache invalidation.
// Each card sees only incident wires, avoiding a nodes × wires scan.
export function sceneIndex(doc) {
  const byId = new Map(), rects = new Map(), incident = new Map();
  for (const node of doc.nodes) { byId.set(node.id, node); rects.set(node.id, nodeRect(node)); incident.set(node.id, []); }
  for (const wire of doc.wires) {
    incident.get(wire.from.node)?.push(wire);
    if (wire.to.node !== wire.from.node) incident.get(wire.to.node)?.push(wire);
  }
  return { byId, rects, incident, lanes: wireLanes(doc.wires) };
}
