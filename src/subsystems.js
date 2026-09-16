import { nodePart } from './rdk/profiles.js';
import { uid, newDoc } from './state.js';
import { partOf, normalizePart, LIMITS } from './custom.js';
import { selectedEngineering } from './engineering.js';

export function groupSubsystem(store, ids, name) {
  const selected = new Set(ids), doc = store.doc;
  const nodes = doc.nodes.filter(n => selected.has(n.id));
  if (!nodes.length || nodes.some(n => n.locked)) throw new Error('Select unlocked parts to create a subsystem');
  const depth = n => n.subsystem ? 1 + Math.max(0, ...n.subsystem.doc.nodes.map(depth)) : 0;
  if (Math.max(...nodes.map(depth)) >= 8) throw new Error('Subsystem nesting is limited to eight levels');
  const members = new Set(nodes.map(n => n.id));
  const inside = doc.wires.filter(w => members.has(w.from.node) && members.has(w.to.node));
  const boundary = doc.wires.filter(w => members.has(w.from.node) !== members.has(w.to.node));
  const ports = [], exposed = [], portMap = new Map();
  for (const wire of boundary) {
    const end = members.has(wire.from.node) ? wire.from : wire.to;
    const key = JSON.stringify(end);
    if (portMap.has(key)) continue;
    const node = nodes.find(n => n.id === end.node);
    const port = nodePart(node).ports.find(p => p.id === end.port);
    const id = 'p' + (ports.length + 1);
    ports.push({ id, name: `${ports.length + 1} ${node.label} ${port?.name || end.port}`.slice(0, 40), side: port?.side || 'right', bus: wire.bus });
    exposed.push({ port: id, node: end.node, childPort: end.port });
    portMap.set(key, id);
  }
  if (ports.length > LIMITS.ports) throw new Error(`A subsystem supports at most ${LIMITS.ports} exposed ports`);
  const id = uid('n'), x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y));
  const child = newDoc(name);
  child.nodes = structuredClone(nodes).map(n => ({ ...n, x: n.x - x, y: n.y - y }));
  child.wires = structuredClone(inside);
  const engineering = selectedEngineering(doc, [...members, ...inside.map(w => w.id)]);
  if (engineering || doc.engineering?.budget) child.engineering = { ...engineering, ...(doc.engineering?.budget ? { budget: structuredClone(doc.engineering.budget) } : {}) };
  const part = normalizePart({ name, category: 'system', icon: { text: 'SYS' }, ports, fields: [] }).part;
  if (!part) throw new Error('Invalid subsystem name');
  store.apply(d => {
    d.nodes = d.nodes.filter(n => !members.has(n.id));
    d.wires = d.wires.filter(w => !inside.some(i => i.id === w.id));
    for (const wire of d.wires) for (const end of ['from', 'to']) if (members.has(wire[end].node)) {
      wire[end] = { node: id, port: portMap.get(JSON.stringify(wire[end])) };
    }
    d.nodes.push({ id, kind: 'custom', x, y, label: name, sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [],
      part, subsystem: { doc: child, exposed } });
    const replaced = new Set([...members, ...inside.map(w => w.id)]);
    for (const key of ['requirements', 'decisions']) for (const r of d.engineering?.[key] || []) r.targets = [...new Set(r.targets.map(t => replaced.has(t) ? id : t))];
    for (const step of d.journey || []) {
      if (step.targets?.nodes) step.targets.nodes = [...new Set(step.targets.nodes.map(t => members.has(t) ? id : t))];
      if (step.targets?.wires) step.targets.wires = step.targets.wires.filter(t => !replaced.has(t));
      for (const stop of step.stops || []) if (members.has(stop.node)) stop.node = id;
    }
  });
  store.setSelection([id]);
  return id;
}

export function subsystemIssues(node) {
  if (!node.subsystem) return [];
  return node.subsystem.exposed.filter(ref => {
    const child = node.subsystem.doc.nodes.find(n => n.id === ref.node);
    const external = nodePart(node).ports.find(p => p.id === ref.port);
    const inner = child && nodePart(child).ports.find(p => p.id === ref.childPort);
    return !external || !inner || external.bus !== inner.bus;
  });
}

// Parent documents remain intact while navigating. On return the complete child
// is committed in one step; save/export can always reconstruct the root.
export function createSubsystemNavigation(store) {
  const stack = [];
  let navigating = false;
  const replace = doc => { navigating = true; try { store.replaceDoc(doc); } finally { navigating = false; } };
  function rootDoc() {
    if (!stack.length) return store.doc;
    let doc = structuredClone(store.doc);
    for (let i = stack.length - 1; i >= 0; i--) {
      const parent = structuredClone(stack[i].doc);
      parent.nodes.find(n => n.id === stack[i].id).subsystem.doc = doc;
      doc = parent;
    }
    return doc;
  }
  return {
    path: () => stack.map(entry => entry.id),
    depth: () => stack.length, rootDoc, navigating: () => navigating, reset: () => { stack.length = 0; },
    enter(id) {
      const node = store.doc.nodes.find(n => n.id === id);
      if (!node?.subsystem) throw new Error('Select a subsystem');
      if (stack.length >= 8) throw new Error('Subsystem nesting is limited to eight levels');
      stack.push({ id, doc: structuredClone(store.doc), undo: store.undoStack.slice(), redo: store.redoStack.slice() });
      replace(structuredClone(node.subsystem.doc));
    },
    up() {
      const entry = stack.pop(); if (!entry) return;
      const child = store.doc;
      replace(entry.doc);
      store.undoStack = entry.undo;
      store.redoStack = entry.redo;
      store.apply(doc => { doc.nodes.find(n => n.id === entry.id).subsystem.doc = child; });
      store.setSelection([entry.id]);
    },
  };
}

export function exposePort(store, id, ref, name) {
  const wrapper = store.doc.nodes.find(n => n.id === id);
  const child = wrapper?.subsystem?.doc.nodes.find(n => n.id === ref.node);
  const port = child && nodePart(child).ports.find(p => p.id === ref.port);
  if (!port) throw new Error('Choose an existing internal port');
  const existing = wrapper.subsystem.exposed.find(p => p.node === ref.node && p.childPort === ref.port);
  if (existing) return existing.port;
  if (wrapper.part.ports.length >= LIMITS.ports) throw new Error(`A subsystem supports at most ${LIMITS.ports} exposed ports`);
  let n = 1; while (wrapper.part.ports.some(p => p.id === 'p' + n)) n++;
  const portId = 'p' + n;
  const result = normalizePart({ ...wrapper.part, ports: [...wrapper.part.ports, { id: portId, name: String(name || port.name).slice(0, 40), side: port.side, bus: port.bus }] });
  if (!result.part?.ports.some(p => p.id === portId)) throw new Error('That port name is already used on this side');
  store.apply(doc => {
    const node = doc.nodes.find(n => n.id === id);
    node.part = result.part;
    node.subsystem.exposed.push({ port: portId, node: ref.node, childPort: ref.port });
  });
  return portId;
}
