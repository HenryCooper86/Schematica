// Import KiCad’s documented intermediate XML netlist with stable source identities.
// Named nets become explicit junctions; no protocol or electrical limits guessed.
import { tr } from './i18n.js';
import { newDoc } from './state.js';
import { nodeSize } from './geometry.js';
import { normalizePart, LIMITS } from './custom.js';

// Length-prefixed tuples encoded without hashes or truncation. The same
// source identity always has the same id, independent of export order.
export function kiCadId(kind, ...identity) {
  const bytes = new TextEncoder().encode(identity.map(value => `${value.length}:${value}`).join(''));
  const id = kind + '_' + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  // Journey targets and stops share this persistent reference limit. Never
  // import an identity that would disappear from those records on reload.
  if (id.length > 200) throw new Error(tr('A KiCad identity exceeds the 200-character saved reference limit.'));
  return id;
}
const identity = (value, max = 512) => {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || !value.isWellFormed()) throw new Error(tr('Missing, ambiguous or oversized KiCad source identity'));
  return value;
};
const sourceText = value => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 20000) throw new Error(tr('Oversized KiCad source metadata'));
  return value;
};
const pinIdentity = value => {
  if (typeof value !== 'string' || value.length > LIMITS.portName || value.trim().replace(/\s+/g, ' ') !== value) throw new Error(tr('A KiCad pin name cannot be represented without truncation'));
  return identity(value, LIMITS.portName);
};
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function fromKiCadData({ title = 'KiCad architecture', source, components, nets }) {
  if (!Array.isArray(components) || !components.length || components.length > 1000 || !Array.isArray(nets) || nets.length > 2000) throw new Error(tr('Expected 1–1000 components and at most 2000 nets'));
  if (source !== undefined) identity(source, 1024);
  components = components.map(c => ({ ref: identity(c?.ref), value: sourceText(c.value), footprint: sourceText(c.footprint) })).sort((a, b) => order(a.ref, b.ref));
  const netNames = new Set();
  let endpointCount = 0;
  nets = nets.map(n => {
    const name = identity(n?.name);
    if (netNames.has(name)) throw new Error(tr('Duplicate KiCad net name'));
    netNames.add(name);
    if (!Array.isArray(n.nodes) || (endpointCount += n.nodes.length) > 64000) throw new Error(tr('Invalid KiCad net endpoints'));
    return { name, nodes: n.nodes.map(e => ({ ref: identity(e?.ref), pin: pinIdentity(e?.pin) })).sort((a, b) => order(a.ref, b.ref) || order(a.pin, b.pin)) };
  }).sort((a, b) => order(a.name, b.name));
  const doc = newDoc(title), byRef = new Map(), pins = new Map();
  for (const [index, component] of components.entries()) {
    if (!component.ref || byRef.has(component.ref)) throw new Error(tr('Missing or duplicate KiCad reference'));
    const node = { id: kiCadId('kc', component.ref), kind: 'custom', x: (index % 8) * 300, y: Math.floor(index / 8) * 260,
      label: component.ref, sublabel: component.value || '', addr: '', rail: '', notes: '', color: null, status: null, flags: [] };
    byRef.set(component.ref, node); pins.set(component.ref, new Map()); doc.nodes.push(node);
  }
  for (const [index, net] of nets.entries()) {
    const hub = { id: kiCadId('kn', net.name), kind: 'custom', x: 2600 + (index % 4) * 240, y: Math.floor(index / 4) * 180,
      label: net.name, sublabel: '', addr: '', rail: '', notes: 'KiCad net', color: null, status: null, flags: [],
      part: normalizePart({ name: 'Net', category: 'connectivity', icon: { text: 'NET' }, ports: [{ id: 'net', name: 'Net', side: 'left', bus: 'link' }], fields: [] }).part };
    doc.nodes.push(hub);
    const seen = new Set();
    for (const end of net.nodes) {
      const node = byRef.get(end.ref);
      if (!node || !end.pin) throw new Error(tr('A net references a missing component or pin'));
      const key = JSON.stringify([end.ref, end.pin]); if (seen.has(key)) throw new Error(tr('Duplicate KiCad pin identity')); seen.add(key);
      const ports = pins.get(end.ref);
      if (ports.has(end.pin)) throw new Error(tr('A component pin appears on more than one net'));
      if (ports.size >= LIMITS.ports) throw new Error(tr('This prototype supports at most {max} connected pins per component', { max: LIMITS.ports }));
      const id = kiCadId('p', end.pin);
      if (id.length > LIMITS.id) throw new Error(tr('A KiCad pin name cannot be represented without truncation'));
      ports.set(end.pin, { id, name: String(end.pin), side: ports.size % 2 ? 'right' : 'left', bus: 'link' });
      doc.wires.push({ id: kiCadId('kw', net.name, end.ref, end.pin), bus: 'link', from: { node: node.id, port: id }, to: { node: hub.id, port: 'net' }, label: '', arrow: null, flow: null, style: null });
    }
  }
  for (const component of components) {
    const node = byRef.get(component.ref);
    node.part = normalizePart({ name: component.value || component.ref, category: 'misc', icon: { text: 'IC' }, ports: [...pins.get(component.ref).values()].sort((a, b) => order(a.name, b.name)).map((p, i) => ({ ...p, side: i % 2 ? 'right' : 'left' })), fields: [{ id: 'footprint', label: 'Footprint' }] }).part;
    if (component.footprint.trim()) node.fields = { footprint: component.footprint };
    if (!node.part || node.part.ports.length !== pins.get(component.ref).size) throw new Error(tr('A KiCad component could not be represented without losing pins'));
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
  grid(doc.nodes.filter(n => n.id.startsWith('kn_')), 4, right + 80);
  if (source !== undefined) doc.kicad = { version: 1, source, components, nets };
  return doc;
}
export function importKiCad(xml, Parser = globalThis.DOMParser) {
  if (typeof xml !== 'string' || xml.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(tr('Unsupported or oversized KiCad XML'));
  if (!Parser) throw new Error(tr('XML import requires a browser DOMParser'));
  const parsed = new Parser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.tagName !== 'export') throw new Error(tr('Expected a KiCad intermediate XML netlist'));
  const sources = parsed.querySelectorAll('design > source');
  if (sources.length > 1) throw new Error(tr('Missing, ambiguous or oversized KiCad source identity'));
  const source = sources[0]?.textContent;
  return fromKiCadData({ title: source || 'KiCad architecture', ...(source ? { source } : {}),
    components: [...parsed.querySelectorAll('components > comp')].map(c => ({ ref: c.getAttribute('ref'), value: c.querySelector('value')?.textContent, footprint: c.querySelector('footprint')?.textContent })),
    nets: [...parsed.querySelectorAll('nets > net')].map(n => ({ name: n.getAttribute('name'), nodes: [...n.querySelectorAll('node')].map(e => ({ ref: e.getAttribute('ref'), pin: e.getAttribute('pin') })) })) });
}

// Provenance is data, never permission. Rebuild only from bounded, validated
// source records; the update engine independently verifies their ownership.
export function validateKiCadProvenance(raw) {
  if (!raw || raw.version !== 1 || typeof raw.source !== 'string') throw new Error(tr('Invalid KiCad import provenance'));
  return fromKiCadData({ source: raw.source, components: raw.components, nets: raw.nets }).kicad;
}
