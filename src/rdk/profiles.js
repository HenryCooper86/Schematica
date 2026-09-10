import { partOf } from '../custom.js';
import { RDK_PRODUCTS, profileFor } from './catalogue.js';
export { profileFor } from './catalogue.js';

// The part a node resolves to: its custom definition, or its catalogue part
// with the RDK profile's ports when a vendor preset names one.
export function nodePart(node) {
  const part = partOf(node);
  const profile = part.custom ? null : profileFor(node);
  return profile?.ports ? { ...part, ports: profile.ports } : part;
}

// Every port id a saved wire on this node may legitimately name: the part's
// own ports plus any port of an RDK product of the same kind (a preset switch
// keeps old endpoints as "unsupported" rather than dropping them).
export function knownPorts(node) {
  const part = partOf(node);
  const ports = new Map(part.ports.map((p) => [p.id, p]));
  if (!part.custom) {
    for (const product of RDK_PRODUCTS.filter((p) => p.kind === node.kind)) {
      for (const port of product.ports || []) if (!ports.has(port.id)) ports.set(port.id, port);
    }
  }
  return [...ports.values()];
}
export function displayPart(node, wires = []) {
  const part = nodePart(node);
  const used = new Set(
    wires
      .flatMap((w) => [w.from, w.to])
      .filter((ref) => ref?.node === node.id)
      .map((ref) => ref.port),
  );
  const supported = new Set(part.ports.map((p) => p.id));
  const ports = [...part.ports];
  for (const legacy of knownPorts(node)) {
    if (!used.has(legacy.id) || supported.has(legacy.id)) continue;
    const occupied = ports
      .filter((p) => p.side === legacy.side)
      .map((p) => p.offset);
    let offset = legacy.offset;
    if (occupied.includes(offset)) {
      // Put the preserved endpoint in the largest free gap on its side.
      const edges = [0, ...occupied, 1].sort((a, b) => a - b);
      let gap = -1;
      for (let i = 1; i < edges.length; i++) {
        if (edges[i] - edges[i - 1] > gap) {
          gap = edges[i] - edges[i - 1];
          offset = (edges[i] + edges[i - 1]) / 2;
        }
      }
    }
    ports.push({ ...legacy, offset, unsupported: true });
  }
  return { ...part, ports };
}
