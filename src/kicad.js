// Experimental one-way import of KiCad's documented intermediate XML netlist.
// Named nets become explicit junctions; no protocol or electrical limits guessed.
import { newDoc } from './state.js';
import { nodeSize } from './geometry.js';
import { normalizePart, LIMITS } from './custom.js';

export function fromKiCadData({ title = 'KiCad architecture', components, nets }) {
  if (!Array.isArray(components) || !components.length || components.length > 1000 || !Array.isArray(nets) || nets.length > 2000) throw new Error('Expected 1–1000 components and at most 2000 nets');
  const doc = newDoc(title), byRef = new Map(), pins = new Map();
  for (const [index, component] of components.entries()) {
    if (!component.ref || byRef.has(component.ref)) throw new Error('Missing or duplicate KiCad reference');
    const node = { id: 'k' + index, kind: 'custom', x: (index % 8) * 300, y: Math.floor(index / 8) * 260,
      label: component.ref, sublabel: component.value || '', addr: '', rail: '', notes: component.footprint || '', color: null, status: null, flags: [] };
    byRef.set(component.ref, node); pins.set(component.ref, new Map()); doc.nodes.push(node);
  }
  for (const [index, net] of nets.entries()) {
    if (!net.nodes?.length) continue;
    const hub = { id: 'net' + index, kind: 'custom', x: 2600 + (index % 4) * 240, y: Math.floor(index / 4) * 180,
      label: net.name || `Net ${index + 1}`, sublabel: '', addr: '', rail: '', notes: 'KiCad net', color: null, status: null, flags: [],
      part: normalizePart({ name: 'Net', category: 'connectivity', icon: { text: 'NET' }, ports: [{ id: 'net', name: 'Net', side: 'left', bus: 'link' }], fields: [] }).part };
    doc.nodes.push(hub);
    const seen = new Set();
    for (const end of net.nodes) {
      const node = byRef.get(end.ref);
      if (!node || !end.pin) throw new Error('A net references a missing component or pin');
      const key = JSON.stringify([end.ref, end.pin]); if (seen.has(key)) continue; seen.add(key);
      const ports = pins.get(end.ref);
      if (ports.has(end.pin)) throw new Error('A component pin appears on more than one net');
      if (ports.size >= LIMITS.ports) throw new Error(`This prototype supports at most ${LIMITS.ports} connected pins per component`);
      if (String(end.pin).trim() !== String(end.pin) || String(end.pin).length > LIMITS.portName) throw new Error('A KiCad pin name cannot be represented without truncation');
      const id = 'p' + ports.size;
      ports.set(end.pin, { id, name: String(end.pin), side: ports.size % 2 ? 'right' : 'left', bus: 'link' });
      doc.wires.push({ id: `kw${doc.wires.length}`, bus: 'link', from: { node: node.id, port: id }, to: { node: hub.id, port: 'net' }, label: '', arrow: null, flow: null, style: null });
    }
  }
  for (const component of components) {
    const node = byRef.get(component.ref);
    node.part = normalizePart({ name: component.value || component.ref, category: 'misc', icon: { text: 'IC' }, ports: [...pins.get(component.ref).values()], fields: [] }).part;
    if (!node.part || node.part.ports.length !== pins.get(component.ref).size) throw new Error('A KiCad component could not be represented without losing pins');
  }
  // Tall packages and long net labels must not overlap the next grid row/column.
  const grid = (nodes, columns, originX) => {
    const sizes = nodes.map(nodeSize), widths = Array(columns).fill(0);
    sizes.forEach((size, i) => { widths[i % columns] = Math.max(widths[i % columns], size.w); });
    let y = 0;
    for (let row = 0; row < nodes.length; row += columns) {
      let x = originX;
      for (let col = 0; col < columns && row + col < nodes.length; col++) {
        Object.assign(nodes[row + col], { x, y }); x += widths[col] + 80;
      }
      y += Math.max(...sizes.slice(row, row + columns).map(size => size.h)) + 80;
    }
    return originX + widths.reduce((sum, width) => sum + width + 80, 0);
  };
  const right = grid([...byRef.values()], 8, 0);
  grid(doc.nodes.filter(n => n.id.startsWith('net')), 4, right + 80);
  return doc;
}
export function importKiCad(xml, Parser = globalThis.DOMParser) {
  if (typeof xml !== 'string' || xml.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Unsupported or oversized KiCad XML');
  if (!Parser) throw new Error('XML import requires a browser DOMParser');
  const parsed = new Parser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.tagName !== 'export') throw new Error('Expected a KiCad intermediate XML netlist');
  return fromKiCadData({ title: parsed.querySelector('design > source')?.textContent || 'KiCad architecture',
    components: [...parsed.querySelectorAll('components > comp')].map(c => ({ ref: c.getAttribute('ref'), value: c.querySelector('value')?.textContent, footprint: c.querySelector('footprint')?.textContent })),
    nets: [...parsed.querySelectorAll('nets > net')].map(n => ({ name: n.getAttribute('name'), nodes: [...n.querySelectorAll('node')].map(e => ({ ref: e.getAttribute('ref'), pin: e.getAttribute('pin') })) })) });
}
