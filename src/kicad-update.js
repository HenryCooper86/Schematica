// Pure, conservative merge of the topology owned by one KiCad source.
import { fromKiCadData, validateKiCadProvenance } from './kicad.js';
import { normalizePart } from './custom.js';
import { compareBoards } from './compare.js';
import { tr } from './i18n.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const index = items => new Map(items.map(item => [item.id, item]));
const portShape = node => node.part?.ports.map(p => [p.id, p.name, p.bus]).sort((a, b) => a[0].localeCompare(b[0]));
// Mirrors partChangePatch's budget/interface/field invalidation policy, but
// rejects the import until the author resolves declarations instead of
// silently clearing them. Only the unchanged source footprint is exempt.
const hasAuthoredDeclarations = (node, source) => Object.keys(node.budget || {}).length
  || Object.keys(node.interfacePorts || {}).length
  || Object.entries(node.fields || {}).some(([key, value]) => key !== 'footprint' || value !== source.fields?.footprint)
  || node.part.ports.some(p => p.required) || node.part.feeds?.length || node.part.passes?.length;
const wireShape = wire => [wire.bus, wire.from.node, wire.from.port, wire.to.node, wire.to.port];
function owned(doc) {
  if (!doc.kicad) throw new Error(tr('This board has no KiCad provenance. Import a new board before updating.'));
  const provenance = validateKiCadProvenance(doc.kicad);
  const source = fromKiCadData(provenance), nodes = index(doc.nodes), wires = index(doc.wires);
  const ids = [...doc.nodes, ...doc.wires, ...doc.notes, ...doc.zones, ...doc.journey].map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error(tr('KiCad update conflicts with duplicate board identities.'));
  // A manifest alone cannot claim ownership of arbitrary authored items.
  // Every claimed item must have its exact source-derived id and topology.
  for (const node of source.nodes) {
    const current = nodes.get(node.id);
    if (!current || current.kind !== 'custom' || current.subsystem || !equal(portShape(current), portShape(node)) || (node.part.fields.some(f => f.id === 'footprint') && !current.part.fields?.some(f => f.id === 'footprint')))
      throw new Error(tr('Imported topology was edited locally. Import a new board or restore its source topology before updating.'));
  }
  for (const wire of source.wires) {
    const current = wires.get(wire.id);
    if (!current || !equal(wireShape(current), wireShape(wire)))
      throw new Error(tr('Imported topology was edited locally. Import a new board or restore its source topology before updating.'));
  }
  return source;
}
export function previewKiCadUpdate(current, incoming) {
  const oldSource = owned(current), newSource = owned(incoming);
  if (oldSource.kicad.source !== newSource.kicad.source) throw new Error(tr('The KiCad source does not match this imported board.'));
  const oldNodes = index(oldSource.nodes), oldWires = index(oldSource.wires), nextNodes = index(newSource.nodes), nextWires = index(newSource.wires);
  const allIds = new Set([...current.nodes, ...current.wires, ...current.notes, ...current.zones, ...current.journey].map(item => item.id));
  for (const item of [...newSource.nodes, ...newSource.wires]) {
    if (allIds.has(item.id) && !oldNodes.has(item.id) && !oldWires.has(item.id)) throw new Error(tr('A new KiCad item conflicts with an authored item identity.'));
  }
  const removedPorts = new Set();
  for (const node of current.nodes.filter(n => oldNodes.has(n.id))) {
    const next = nextNodes.get(node.id), before = oldNodes.get(node.id);
    for (const port of node.part.ports) if (!next?.part.ports.some(p => p.id === port.id)) removedPorts.add(JSON.stringify([node.id, port.id]));
    const connected = source => source.wires.filter(w => w.from.node === node.id || w.to.node === node.id).map(w => w.id).sort();
    if (node.locked && (!next || !equal(portShape(before), portShape(next)) || before.sublabel !== next.sublabel || !equal(before.fields, next.fields) || !equal(connected(oldSource), connected(newSource))))
      throw new Error(tr('Unlock imported items affected by this update before previewing it.'));
    if (next && node.sublabel !== next.sublabel && hasAuthoredDeclarations(node, before))
      throw new Error(tr('Part replacement would carry old engineering declarations. Preserve or remove those declarations explicitly before updating.'));
    const declaredPorts = [...Object.keys(node.interfacePorts || {}), ...node.part.ports.filter(p => p.required).map(p => p.id), ...(node.part.feeds || []), ...(node.part.passes || [])];
    if (declaredPorts.some(port => !next || removedPorts.has(JSON.stringify([node.id, port]))))
      throw new Error(tr('This update removes declared endpoints. Preserve or remove those declarations explicitly before updating.'));
  }
  for (const wire of current.wires) {
    if (!oldWires.has(wire.id) && [wire.from, wire.to].some(end => removedPorts.has(JSON.stringify([end.node, end.port]))))
      throw new Error(tr('This update removes ports used by manual connections. Reconnect or remove those connections before updating.'));
    if (oldWires.has(wire.id) && !nextWires.has(wire.id) && (wire.locked || wire.spec || wire.label || wire.arrow || wire.flow || wire.style))
      throw new Error(tr('This update removes annotated or locked imported connections. Preserve or remove their annotations explicitly before updating.'));
  }
  const proposal = structuredClone(current);
  proposal.nodes = proposal.nodes.filter(n => !oldNodes.has(n.id) || nextNodes.has(n.id)).map(node => {
    if (!oldNodes.has(node.id)) return node;
    const next = nextNodes.get(node.id), oldPorts = index(node.part.ports);
    node.sublabel = next.sublabel;
    node.part.name = next.part.name;
    const nextPortIds = new Set(next.part.ports.map(p => p.id));
    // Port order controls attachment geometry. Keep surviving authored ports
    // in their current order and append only newly imported pins.
    node.part.ports = node.part.ports.filter(p => nextPortIds.has(p.id));
    node.part.ports.push(...next.part.ports.filter(p => !oldPorts.has(p.id)).map(p => structuredClone(p)));
    // Each source is representable on its own, but keeping authored sides
    // can create case-insensitive same-side name collisions in the merge.
    // Validate the full merged definition against the persistence validator.
    const normalized = normalizePart(node.part);
    if (normalized.warnings.length || !equal(canonical(normalized.part), canonical(node.part)))
      throw new Error(tr('This KiCad update would lose ports or part metadata on reload. Resolve conflicting port names and sides before updating.'));
    node.fields ||= {};
    if (next.fields?.footprint) node.fields.footprint = next.fields.footprint; else delete node.fields.footprint;
    if (!Object.keys(node.fields).length) delete node.fields;
    return node;
  });
  proposal.nodes.push(...newSource.nodes.filter(n => !oldNodes.has(n.id)).map(n => structuredClone(n)));
  proposal.wires = proposal.wires.filter(w => !oldWires.has(w.id) || nextWires.has(w.id));
  proposal.wires.push(...newSource.wires.filter(w => !oldWires.has(w.id)).map(w => structuredClone(w)));
  proposal.kicad = structuredClone(newSource.kicad);
  const comparison = compareBoards(current, proposal);
  // Requirement/decision/journey references deliberately remain, including
  // removed targets. Existing coverage and impact views report them missing.
  return { proposal, comparison };
}
export function captureKiCadUpdate(store) {
  return { generation: store.generation, snapshot: JSON.stringify(store.doc) };
}
export function assertKiCadUpdateCurrent(store, stamp) {
  if (store.generation !== stamp.generation || JSON.stringify(store.doc) !== stamp.snapshot || store.inBatch())
    throw new Error(tr('The board changed. Preview again before applying.'));
}
export function prepareKiCadUpdate(store, incoming, stamp = captureKiCadUpdate(store)) {
  assertKiCadUpdateCurrent(store, stamp);
  return { ...previewKiCadUpdate(store.doc, incoming), ...stamp, incoming: structuredClone(incoming) };
}
export function applyKiCadUpdate(store, preview) {
  assertKiCadUpdateCurrent(store, preview);
  const { proposal } = previewKiCadUpdate(store.doc, preview.incoming);
  store.apply(doc => { doc.nodes = proposal.nodes; doc.wires = proposal.wires; doc.kicad = proposal.kicad; });
}
