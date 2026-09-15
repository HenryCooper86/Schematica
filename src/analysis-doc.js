// Expand subsystem boundary ports for analysis without changing the saved model.
// Scoped IDs prevent collisions; selectionId maps findings back to a visible card.
export function analysisDoc(source) {
  if (!source.nodes.some(n => n.subsystem)) return source;
  const out = { ...source, nodes: [], wires: [], zones: [], notes: [], journey: [] };
  const records = { requirements: [], decisions: [] };
  const idAt = (path, id) => JSON.stringify([...path, id]);
  function walk(doc, path, owner, offset, labels, inheritedInterfacesRequired = false) {
    const interfacesRequired = inheritedInterfacesRequired || doc.engineering?.interfacesRequired === true;
    const mapped = new Map();
    const resolve = (ref, scope = doc, currentPath = path) => {
      const node = scope.nodes.find(n => n.id === ref.node);
      const exposed = node?.subsystem?.exposed.find(p => p.port === ref.port);
      if (exposed) return resolve({ node: exposed.node, port: exposed.childPort }, node.subsystem.doc, [...currentPath, node.id]);
      return { node: idAt(currentPath, ref.node), port: ref.port };
    };
    for (const n of doc.nodes) {
      const id = idAt(path, n.id), selectionId = owner || n.id;
      if (n.subsystem) {
        const start = out.nodes.length;
        walk(n.subsystem.doc, [...path, n.id], selectionId, { x: offset.x + n.x, y: offset.y + n.y }, [...labels, n.label], interfacesRequired);
        mapped.set(n.id, out.nodes.slice(start).map(n => n.id));
        // Keep a fallback vertex only for unresolved outer ports.
        if (doc.wires.some(w => [w.from, w.to].some(r => r.node === n.id && !n.subsystem.exposed.some(p => p.port === r.port)))) {
          out.nodes.push({ ...n, id, subsystem: undefined, selectionId });
        }
      } else {
        out.nodes.push({ ...n, id, selectionId, x: n.x + offset.x, y: n.y + offset.y, label: [...labels, n.label].join(' / ') });
        mapped.set(n.id, [id]);
      }
    }
    for (const w of doc.wires) {
      const id = idAt(path, w.id); mapped.set(w.id, [id]);
      // Analysis-only metadata keeps each scope's checking policy with its wires.
      out.wires.push({ ...w, id, selectionId: owner || w.id, from: resolve(w.from), to: resolve(w.to), ...(interfacesRequired ? { interfacesRequired: true } : {}) });
    }
    for (const kind of ['zones', 'notes']) for (const item of doc[kind] || []) {
      const id = idAt(path, item.id); mapped.set(item.id, [id]);
      out[kind].push({ ...item, id, selectionId: owner || item.id, x: item.x + offset.x, y: item.y + offset.y });
    }
    for (const key of ['requirements', 'decisions']) for (const record of doc.engineering?.[key] || []) {
      records[key].push({ ...record, id: idAt(path, record.id), targets: record.targets.flatMap(id => mapped.get(id) || [idAt(path, id)]) });
    }
  }
  walk(source, [], null, { x: 0, y: 0 }, []);
  if (source.engineering || records.requirements.length || records.decisions.length) out.engineering = { ...source.engineering, ...records };
  return out;
}
