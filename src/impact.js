import { architectureScopes, scopedId } from './architecture-scopes.js';
import { checkDoc } from './drc.js';
import { powerSummary } from './power.js';
const cosmetic = new Set(['x', 'y', 'w', 'h', 'view', 'label', 'color']);
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function indexed(doc) {
  const items = new Map(),
    records = { requirements: [], decisions: [] };
  for (const scope of architectureScopes(doc)) {
    for (const collection of ['nodes', 'wires'])
      for (const item of scope.doc[collection]) {
        const payload = Object.fromEntries(
          Object.entries(item).filter(([key]) => !cosmetic.has(key)),
        );
        if (item.subsystem) payload.subsystem = { exposed: item.subsystem.exposed };
        items.set(scopedId(scope.path, item.id), {
          key: scopedId(scope.path, item.id),
          id: item.id,
          scope: scope.key,
          scopeTitle: scope.title,
          label: item.label || item.id,
          collection,
          payload,
          ...(collection === 'wires'
            ? { ends: [item.from, item.to].map((ref) => scopedId(scope.path, ref.node)) }
            : {}),
          ...(item.subsystem
            ? {
                children: item.subsystem.doc.nodes.map((n) =>
                  scopedId([...scope.path, item.id], n.id),
                ),
              }
            : {}),
        });
      }
    for (const kind of Object.keys(records))
      for (const record of scope.doc.engineering?.[kind] || [])
        records[kind].push({
          ...record,
          key: scopedId(scope.path, record.id),
          scope: scope.key,
          scopeTitle: scope.title,
          targets: record.targets.map((id) => scopedId(scope.path, id)),
        });
  }
  return { items, records };
}
export function impactAnalysis(before, after) {
  const a = indexed(before),
    b = indexed(after),
    changed = [];
  for (const key of new Set([...a.items.keys(), ...b.items.keys()])) {
    const prev = a.items.get(key),
      next = b.items.get(key);
    if (!prev || !next || !equal(prev.payload, next.payload)) {
      const fields =
        prev && next
          ? [...new Set([...Object.keys(prev.payload), ...Object.keys(next.payload)])].filter(
              (k) => !equal(prev.payload[k], next.payload[k]),
            )
          : [];
      changed.push({
        ...(next || prev),
        type: !prev ? 'added' : !next ? 'removed' : 'changed',
        fields,
      });
    }
  }
  const oldScopes = new Map(architectureScopes(before).map((s) => [s.key, s]));
  for (const scope of architectureScopes(after))
    if (!equal(oldScopes.get(scope.key)?.doc.engineering?.budget, scope.doc.engineering?.budget)) {
      for (const node of scope.doc.nodes) {
        const item = b.items.get(scopedId(scope.path, node.id));
        if (!changed.some((c) => c.key === item.key))
          changed.push({ ...item, type: 'changed', fields: ['budget-assumptions'] });
      }
    }
  const adjacency = new Map();
  const connect = (x, y) => {
    if (!adjacency.has(x)) adjacency.set(x, new Set());
    adjacency.get(x).add(y);
    if (!adjacency.has(y)) adjacency.set(y, new Set());
    adjacency.get(y).add(x);
  };
  for (const { items } of [a, b])
    for (const item of items.values()) {
      for (const end of item.ends || []) connect(item.key, end);
      for (const child of item.children || []) connect(item.key, child);
    }
  const distances = new Map(changed.map((item) => [item.key, 0])),
    queue = [...distances.keys()];
  for (let i = 0; i < queue.length; i++)
    for (const next of adjacency.get(queue[i]) || [])
      if (!distances.has(next)) {
        distances.set(next, distances.get(queue[i]) + 1);
        queue.push(next);
      }
  const affected = queue.map((key) => ({
    ...(b.items.get(key) || a.items.get(key)),
    distance: distances.get(key),
  }));
  const records = {};
  for (const kind of ['requirements', 'decisions']) {
    const old = new Map(a.records[kind].map((r) => [r.key, r])),
      next = new Map(b.records[kind].map((r) => [r.key, r]));
    records[kind] = [...new Set([...old.keys(), ...next.keys()])]
      .map((key) => {
        const prev = old.get(key),
          cur = next.get(key),
          record = cur || prev;
        const recordData = (r) =>
          r &&
          Object.fromEntries(
            ['id', 'text', 'rationale', 'owner', 'evidence', 'status', 'targets'].map((k) => [
              k,
              r[k],
            ]),
          );
        const modified = !equal(recordData(prev), recordData(cur)),
          related = [...new Set([...(prev?.targets || []), ...(cur?.targets || [])])].filter((id) =>
            distances.has(id),
          );
        return modified || related.length
          ? {
              ...record,
              removed: !cur,
              reason: modified ? 'record-changed' : 'connected-change',
              affectedTargets: related,
            }
          : null;
      })
      .filter(Boolean);
  }
  const previousFindings = checkDoc(before),
    findings = checkDoc(after);
  const signature = (f) => JSON.stringify([f.rule, f.level, [...f.ids].sort(), f.message]);
  const oldFindings = new Set(previousFindings.map(signature));
  const oldPower = powerSummary(before),
    newPower = powerSummary(after);
  return {
    version: 1,
    changed,
    affected,
    ...records,
    budgets: { before: oldPower, after: newPower, changed: !equal(oldPower, newPower) },
    newFindings: findings.filter((f) => !oldFindings.has(signature(f))),
    note: 'Connected items are a conservative review scope, not proof of functional impact. Missing declarations may hide incompatibilities.',
  };
}
export function proposePartChange(doc, { id, partNumber, rail }) {
  const proposal = structuredClone(doc),
    node = proposal.nodes.find((n) => n.id === id);
  if (!node || node.locked) throw new Error('Choose an unlocked part');
  const replacement = partNumber !== node.sublabel;
  node.sublabel = String(partNumber).slice(0, 20000);
  node.rail = String(rail).slice(0, 20000);
  if (replacement) {
    delete node.budget;
    delete node.interfacePorts;
    node.fields = {};
  }
  return proposal;
}
