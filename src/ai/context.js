// What the model reads: the board as one line per item, ids first, and the
// palette catalogue (Task 11). Both are plain text a person can read too.
import { rdkProfile, referenceText } from '../rdk/guide.js';
import { PARTS, CATEGORIES } from '../palette.js';
import { partOf } from '../custom.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import { PRESETS } from '../presets.js';
import { zoneMembers } from '../geometry.js';
import { SHARED_BUSES, UNTYPED_BUSES } from './ops.js';

export function quote(s) {
  return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

// Bare when it is one simple token, quoted otherwise.
const value = (s) => (/^[\w.:/#@+-]+$/.test(String(s)) ? String(s) : quote(s));

export function nodeLine(doc, node) {
  const part = partOf(node);
  let s = `node ${node.id} ${node.kind} ${quote(node.label)}`;
  const profile = rdkProfile(node);
  if (profile) s += ` rdk-profile=${profile.id} effective-RDK-ports=${profile.ports ? profile.ports.map(p => `${p.id}(${p.bus})`).join(',') : 'unverified (generic drawing ports are not validated connectors)'}`;
  if (part.custom) {
    s += ` custom-ports=${part.ports.map((p) => `${p.id}:${value(p.name)}(${p.bus})`).join(',') || '-'}`;
    if (node.part?.lib) s += ` template=${node.part.lib}`;
  }
  if (node.sublabel) s += ` pn=${value(node.sublabel)}`;
  if (node.addr) s += ` addr=${value(node.addr)}`;
  if (node.rail) s += ` rail=${value(node.rail)}`;
  if (node.status) s += ` status=${node.status}`;
  if (node.flags?.length) s += ` flags=${node.flags.join(',')}`;
  if (node.disposition) s += ` disposition=${node.disposition}`;
  // The model must see a lock: it cannot remove the node, and arrange leaves it.
  if (node.locked) s += ' locked=true';
  for (const fd of part.fields || []) {
    const v = node.fields?.[fd.id];
    if (v) s += ` ${fd.id}=${value(v)}`;
  }
  if (node.color) s += ` color=${node.color}`;
  if (node.notes) s += ` notes=${quote(node.notes)}`;
  return s;
}

function wireLine(w) {
  const arrow = w.arrow === 'fwd' ? '->' : (w.arrow === 'both' ? '<->' : '--');
  let s = `wire ${w.id} ${w.bus} ${w.from.node}.${w.from.port} ${arrow} ${w.to.node}.${w.to.port}`;
  if (w.label) s += ` ${quote(w.label)}`;
  if (w.style) s += ` style=${w.style}`;
  if (w.flow) s += ` flow=${w.flow}`;
  return s;
}

function zoneLine(doc, z) {
  const members = zoneMembers(doc, z).filter((id) => doc.nodes.some((n) => n.id === id));
  const list = members.join(' ') || '-';
  if (z.kind === 'swimlane') return `swimlane ${z.id} ${quote(z.label)} lanes: ${z.lanes.map(quote).join(', ')} members: ${list}`;
  return `zone ${z.id} ${quote(z.label)} members: ${list}`;
}

export function boardText(doc, { selection = [], findings = [] } = {}) {
  const lines = [`board ${quote(doc.title)}`];
  for (const z of doc.zones) lines.push(zoneLine(doc, z));
  for (const n of doc.nodes) lines.push(nodeLine(doc, n));
  const profiles = new Map();
  for (const n of doc.nodes) {
    const p = rdkProfile(n);
    if (p) profiles.set(p.id, p);
  }
  if (profiles.size) {
    lines.push('RDK profiles (reference data): effective RDK ports override generic catalogue ports; unverified profiles require documentation review.');
    lines.push([...profiles.values()].slice(0, 12).map(referenceText).join('\n\n').slice(0, 18000));
    if (profiles.size > 12) lines.push('More profiles omitted; use rdk_reference for details.');
  }
  for (const w of doc.wires) lines.push(wireLine(w));
  for (const t of doc.notes) lines.push(`note ${t.id} ${quote(t.text)}`);
  if (selection.length) lines.push(`selected: ${selection.join(' ')}`);
  for (const f of findings) lines.push(`checks: ${f.level} ${f.rule} ${quote(f.message)} ${f.ids.join(' ')}`);
  return lines.join('\n');
}

export function partLine(part) {
  const ports = part.ports.map((p) => `${p.id}(${p.bus})`).join(', ');
  let s = `${part.kind}  ${part.name}  ports: ${ports || '-'}`;
  if (part.fields) {
    s += `  fields: ${part.fields.map((f) => f.id + (f.options ? `[${f.options.join('|')}]` : '')).join(', ')}`;
  }
  if (part.shape) s += '  [flowchart shape]';
  if (part.threat) s += '  [threat]';
  return s;
}

// A library template in search results, marked so the model knows to use
// add_part with kind custom and template.
export function templateLine(t) {
  const ports = (t.ports || []).map((p) => `${p.id}:${p.name}(${p.bus})`).join(', ');
  return `template ${t.id}  ${t.name}  ports: ${ports || '-'}  [library]`;
}

// The stable block of the system prompt: every kind, every bus, and the
// preset part numbers per kind. Only changes when the palette does.
export function catalogueText() {
  const out = [];
  for (const c of CATEGORIES) {
    const parts = Object.values(PARTS).filter((p) => p.category === c.id);
    if (!parts.length) continue;
    out.push(`## ${c.name}`);
    for (const p of parts) out.push(partLine(p));
  }
  out.push('## Buses');
  for (const id of BUS_ORDER) {
    const kind = SHARED_BUSES.has(id) ? 'shared' : (UNTYPED_BUSES.has(id) ? 'untyped' : 'point-to-point');
    out.push(`${id}  ${BUSES[id].name}  ${kind}`);
  }
  out.push('## Presets (part numbers per kind; list_presets gives the details)');
  for (const [kind, list] of Object.entries(PRESETS)) out.push(`${kind}: ${list.map((p) => p.sublabel).join(', ')}`);
  return out.join('\n');
}
