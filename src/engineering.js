import { normalizeViews, normalizeReviews } from './workflows.js';
import { normalizeConstraints, interfaceCompatibility } from './interface-checks.js';
// Portable engineering records. These live in the document, never in settings.
import { nodePart } from './rdk/profiles.js';
import { toCSV, parseCSV } from './tabular.js';
import { tr } from './i18n.js';

export const text = value => typeof value === 'string' ? value.slice(0, 20000) : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const refs = value => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string').slice(0, 2000))] : [];
export function normalizeSpec(raw) {
  if (!object(raw)) return undefined;
  return { direction: ['from-to', 'to-from', 'bidirectional'].includes(raw.direction) ? raw.direction : '',
    voltage: text(raw.voltage), protocol: text(raw.protocol), rate: text(raw.rate), source: text(raw.source), ...normalizeConstraints(raw) };
}
export function normalizeBudget(raw) {
  if (!object(raw)) return undefined;
  const out = {};
  for (const key of ['inputV', 'outputV', 'efficiency', 'activeMa', 'sleepMa', 'activePeakMa', 'sleepPeakMa', 'dutyPercent']) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0
      && (!['efficiency', 'dutyPercent'].includes(key) || v <= 100)
      && (!['inputV', 'outputV', 'efficiency'].includes(key) || v > 0)) out[key] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
export function normalizeEngineering(raw, warnings = []) {
  if (!object(raw)) return undefined;
  const out = {};
  for (const key of ['requirements', 'decisions']) {
    if (!Array.isArray(raw[key])) continue;
    const seen = new Set();
    out[key] = [];
    for (const entry of raw[key].slice(0, 2000)) {
      const id = text(entry?.id).trim();
      if (!id || seen.has(id)) { warnings.push(tr('An engineering record with an invalid or duplicate ID was ignored.')); continue; }
      seen.add(id);
      out[key].push({ id, text: text(entry.text), rationale: text(entry.rationale), owner: text(entry.owner),
        evidence: text(entry.evidence), status: ['draft', 'verified', 'rejected', 'accepted'].includes(entry.status) ? entry.status : 'draft',
        targets: refs(entry.targets), ...(entry.method !== undefined ? { method: text(entry.method) } : {}),
        ...(entry.verifiedFingerprint ? { verifiedFingerprint: text(entry.verifiedFingerprint), verifiedAt: text(entry.verifiedAt) } : {}) });
    }
  }
  if (Array.isArray(raw.savedViews)) out.savedViews = normalizeViews(raw.savedViews);
  if (Array.isArray(raw.reviews)) out.reviews = normalizeReviews(raw.reviews);
  if (raw.interfacesRequired === true) out.interfacesRequired = true;
  if (object(raw.budget)) out.budget = { mode: ['active', 'sleep', 'average'].includes(raw.budget.mode) ? raw.budget.mode : 'active',
    peaks: raw.budget.peaks === 'noncoincident' ? 'noncoincident' : 'simultaneous' };
  if (Array.isArray(raw.exceptions)) out.exceptions = raw.exceptions.slice(0, 2000).filter(e => object(e) && text(e.id) && text(e.rationale).trim())
    .map(e => ({ id: text(e.id), fingerprint: text(e.fingerprint), rationale: text(e.rationale), owner: text(e.owner), at: text(e.at) }));
  return out;
}

export function interfaceRows(doc) {
  const nodes = new Map(doc.nodes.map(n => [n.id, n]));
  const endpoint = ref => {
    const node = nodes.get(ref.node);
    const port = node && nodePart(node).ports.find(p => p.id === ref.port);
    return `${node?.label || ref.node}.${port?.name || ref.port}`;
  };
  return [...doc.wires].sort((a, b) => a.id.localeCompare(b.id)).map(w => ({
    id: w.id, from: endpoint(w.from), to: endpoint(w.to), bus: w.bus,
    ...(normalizeSpec(w.spec) || { direction: w.arrow === 'both' ? 'bidirectional' : w.arrow === 'fwd' ? 'from-to' : w.arrow === 'back' ? 'to-from' : '', voltage: '', protocol: '', rate: '', source: '' }),
  }));
}
export const ICD_COLUMNS = ['id', 'from', 'to', 'bus', 'direction', 'voltage', 'protocol', 'rate', 'source'];
export const interfaceCSV = doc => toCSV([ICD_COLUMNS, ...interfaceRows(doc).map(row => ICD_COLUMNS.map(key => row[key]))]);

export function importInterfaces(doc, csv) {
  const [headers, ...rows] = parseCSV(csv);
  if (!headers || ICD_COLUMNS.some((key, i) => headers[i] !== key) || headers.length !== ICD_COLUMNS.length) throw new Error('Expected the Schematica ICD column headers');
  const known = new Map(interfaceRows(doc).map(r => [r.id, r]));
  const patches = new Map();
  for (const cells of rows) {
    if (cells.length !== headers.length) throw new Error('An ICD row has the wrong number of cells');
    // Undo the spreadsheet formula guard used by our exporter.
    const row = Object.fromEntries(headers.map((key, i) => [key, cells[i].replace(/^'(?=[=+\-@\t\r])/, '')]));
    const existing = known.get(row.id);
    if (!existing || patches.has(row.id)) throw new Error('Unknown or duplicate interface ID: ' + row.id);
    if (['from', 'to', 'bus'].some(k => row[k] !== existing[k])) throw new Error('Interface endpoints or bus differ: ' + row.id);
    if (row.direction && !['from-to', 'to-from', 'bidirectional'].includes(row.direction)) throw new Error('Invalid interface direction: ' + row.id);
    patches.set(row.id, normalizeSpec({ ...doc.wires.find(w=>w.id===row.id).spec, ...row }));
  }
  for (const wire of doc.wires) if (patches.has(wire.id)) {
    wire.spec = patches.get(wire.id);
    wire.arrow = ({ 'from-to': 'fwd', 'to-from': 'back', bidirectional: 'both' })[wire.spec.direction] || null;
  }
  return patches.size;
}

export function engineeringChecks(doc) {
  const findings = interfaceCompatibility(doc);
  const ids = new Set([...doc.nodes, ...doc.wires, ...(doc.zones || []), ...(doc.notes || [])].map(i => i.id));
  const requiredInterfaces = new Set(doc.wires.filter(w => w.interfacesRequired).map(w => w.id));
  for (const row of interfaceRows(doc)) {
    if (!doc.engineering?.interfacesRequired && !requiredInterfaces.has(row.id)) continue;
    const missing = ['direction', 'voltage', 'protocol', 'rate', 'source'].filter(key => !row[key].trim());
    if (missing.length) findings.push({ rule: 'interface-incomplete', level: 'warning', ids: [row.id],
      message: tr('Interface {id} is missing: {fields}.', { id: row.id, fields: missing.join(', ') }) });
  }
  for (const req of doc.engineering?.requirements || []) {
    if (!req.targets.length) findings.push({ rule: 'requirement-unallocated', level: 'warning', ids: [],
      message: tr('Requirement {id} has no allocation.', { id: req.id }), record: req.id });
    else if (req.targets.some(id => !ids.has(id))) findings.push({ rule: 'requirement-dangling', level: 'warning', ids: req.targets.filter(id => ids.has(id)),
      message: tr('Requirement {id} references a missing item.', { id: req.id }), record: req.id });
    if (req.status === 'verified' && !req.evidence.trim()) findings.push({ rule: 'requirement-evidence', level: 'warning', ids: req.targets.filter(id => ids.has(id)),
      message: tr('Verified requirement {id} has no evidence.', { id: req.id }), record: req.id });
  }
  return findings;
}

export function selectedEngineering(doc, ids) {
  const allowed = new Set(ids), out = {};
  for (const key of ['requirements', 'decisions']) {
    const records = (doc.engineering?.[key] || []).filter(r => r.targets.some(id => allowed.has(id)))
      .map(r => ({ ...structuredClone(r), targets: r.targets.filter(id => allowed.has(id)) }));
    if (records.length) out[key] = records;
  }
  return Object.keys(out).length ? out : undefined;
}
export function mergeEngineering(doc, incoming, map) {
  if (!incoming) return;
  doc.engineering ||= {};
  for (const key of ['requirements', 'decisions']) {
    const existing = doc.engineering[key] ||= [];
    for (const record of incoming[key] || []) {
      const targets = record.targets.map(id => map.get(id)).filter(Boolean);
      if (!targets.length) continue;
      const same = existing.find(r => r.id === record.id);
      if (same && ['text', 'rationale', 'owner', 'evidence', 'status', 'method', 'verifiedFingerprint'].every(k => same[k] === record[k])) {
        same.targets = [...new Set([...same.targets, ...targets])]; continue;
      }
      let id = record.id, suffix = 2;
      while (existing.some(r => r.id === id)) id = `${record.id}-${suffix++}`;
      existing.push({ ...structuredClone(record), id, targets });
    }
  }
}
