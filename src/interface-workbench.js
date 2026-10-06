import { normalizeSpec } from './engineering.js';
import { interfaceCompatibility, interfaceDirection, resolveInterfaceEndpoint } from './interface-checks.js';
import { tr } from './i18n.js';

const FIELDS = ['direction', 'voltage', 'protocol', 'rate', 'source', 'voltageMinV', 'voltageMaxV', 'rateBps'];
const hasValue = value => typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && !!value.trim();

export function interfaceChecklist(doc, wire) {
  if (!wire || ['flow', 'link'].includes(wire.bus)) return [];
  const steps = [], signal = !['power', 'gnd'].includes(wire.bus);
  const add = (prefix, value, endpoint) => {
    const missing = (key, label, explanation, present = hasValue(value[key])) => {
      if (!present) steps.push({ field: prefix + key, label, explanation, endpoint });
    };
    missing('direction', tr('Direction'), tr('Declare the direction supported by this connection or endpoint.'));
    missing('voltageMinV', tr('Minimum voltage (V)'), tr('Use a documented lower voltage limit; leave unknown values blank.'));
    missing('voltageMaxV', tr('Maximum voltage (V)'), tr('Use a documented upper voltage limit; do not substitute a nominal voltage.'));
    if (signal) {
      missing(prefix ? 'protocols' : 'protocol', tr('Protocol version'), tr('Name the supported protocol and revision from your evidence.'),
        prefix ? !!value.protocols?.length : hasValue(value.protocol));
      missing('rateBps', tr('Bandwidth (bit/s)'), tr('Declare the connection requirement or endpoint capacity in bits per second.'));
    }
    missing('source', tr('Source reference'), tr('Record the datasheet, test result, or explicit design assumption behind these values.'));
  };
  add('', { ...wire.spec, direction: interfaceDirection(wire) }, tr('Connection limits'));
  for (const end of ['from', 'to']) add(end + '_', resolveInterfaceEndpoint(doc, wire[end]).capability || {},
    end === 'from' ? tr('From endpoint capabilities') : tr('To endpoint capabilities'));
  return steps;
}

// Copy only explicitly declared connection fields. Endpoint capabilities belong
// to each physical part and are never inferred from another connection.
export function reuseInterfaceFields(doc, sourceId, targetIds) {
  const source = doc.wires.find(w => w.id === sourceId);
  if (!source || ['flow', 'link'].includes(source.bus)) throw new Error(tr('Choose a declared interface source.'));
  const unique = [...new Set(targetIds)];
  if (!unique.length) throw new Error(tr('Choose at least one target connection.'));
  const targets = unique.map(id => doc.wires.find(w => w.id === id));
  if (targets.some(w => !w || w.id === sourceId || w.bus !== source.bus))
    throw new Error(tr('Targets must be different connections on the same bus.'));
  const supplied = normalizeSpec(source.spec) || {};
  supplied.direction = interfaceDirection(source);
  const draft = structuredClone(doc);
  const changes = [];
  for (const target of targets) {
    const wire = draft.wires.find(w => w.id === target.id);
    const current = normalizeSpec(wire.spec) || {};
    current.direction = interfaceDirection(wire);
    const fields = FIELDS.filter(key => hasValue(supplied[key]) && !hasValue(current[key]));
    if (!fields.length) continue;
    wire.spec = normalizeSpec({ ...current, ...Object.fromEntries(fields.map(key => [key, supplied[key]])) });
    if (fields.includes('direction')) wire.arrow = { 'from-to': 'fwd', 'to-from': 'back', bidirectional: 'both' }[wire.spec.direction] || null;
    changes.push({ id: wire.id, fields });
  }
  const changed = new Set(changes.map(c => c.id));
  if (interfaceCompatibility(draft).some(f => f.level === 'error' && changed.has(f.ids[0])))
    throw new Error(tr('Reused fields would make a target interface incompatible.'));
  for (const candidate of draft.wires) if (changed.has(candidate.id)) {
    const original = doc.wires.find(w => w.id === candidate.id);
    original.spec = candidate.spec;
    original.arrow = candidate.arrow;
  }
  return changes;
}
