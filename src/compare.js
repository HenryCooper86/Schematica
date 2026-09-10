// Compare stable identities in two snapshots. A move is not a wiring change;
// endpoint order is reported exactly as authored, without inferring impact.
import { tr } from './i18n.js';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const layout = new Set(['x', 'y', 'w', 'h', 'view']);

export function compareBoards(before, after) {
  const changes = [];
  if (before.title !== after.title) changes.push({ type: 'changed', collection: 'board', id: '', label: after.title,
    fields: [{ field: 'title', before: before.title, after: after.title }] });
  for (const collection of ['nodes', 'wires', 'zones', 'notes', 'journey']) {
    const a = new Map((before[collection] || []).map(item => [item.id, item]));
    const b = new Map((after[collection] || []).map(item => [item.id, item]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const prev = a.get(id), next = b.get(id);
      const label = next?.label || prev?.label || next?.text || prev?.text || id;
      const base = { collection, id, label };
      if (!prev || !next) { changes.push({ ...base, type: prev ? 'removed' : 'added', before: prev, after: next }); continue; }
      const fields = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort()
        .filter(field => field !== 'id' && !equal(prev[field], next[field]))
        .map(field => ({ field, before: prev[field], after: next[field] }));
      const moved = fields.filter(f => layout.has(f.field));
      const rewired = collection === 'wires' ? fields.filter(f => ['from', 'to'].includes(f.field)) : [];
      const changed = fields.filter(f => !moved.includes(f) && !rewired.includes(f));
      if (changed.length) changes.push({ ...base, type: 'changed', fields: changed });
      if (rewired.length) changes.push({ ...base, type: 'rewired', fields: rewired });
      if (moved.length) changes.push({ ...base, type: 'moved', fields: moved });
    }
  }
  // Step order is semantic even when the steps themselves are unchanged.
  const shared = new Set((before.journey || []).filter(s => (after.journey || []).some(t => t.id === s.id)).map(s => s.id));
  const order = doc => (doc.journey || []).filter(s => shared.has(s.id)).map(s => s.id);
  if (!equal(order(before), order(after))) changes.push({ type: 'changed', collection: 'journey', id: '', label: tr('Journey'),
    fields: [{ field: 'order', before: order(before), after: order(after) }] });
  return { version: 1, beforeTitle: before.title, afterTitle: after.title, changes,
    counts: Object.fromEntries(['added', 'removed', 'changed', 'rewired', 'moved'].map(type => [type, changes.filter(c => c.type === type).length])) };
}
