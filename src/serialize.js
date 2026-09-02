import { BUSES, DEFAULT_BUS } from './buses.js';
import { PARTS, getPart } from './palette.js';
import { newDoc, NODE_STATUSES, NODE_FLAGS } from './state.js';

export function serialize(doc) {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid Schematica file: could not parse JSON.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Not a valid Schematica file: top level must be an object.');
  }
  for (const key of ['nodes', 'wires', 'zones', 'notes', 'journey']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) {
      throw new Error(`Not a valid Schematica file: "${key}" must be an array.`);
    }
  }

  const warnings = [];
  if (typeof raw.schema === 'number' && raw.schema > 1) {
    warnings.push(`File schema ${raw.schema} is newer than this app understands (1); loading best-effort.`);
  }

  const doc = newDoc(typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled Board');
  const seen = new Set();
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const validId = (v) => typeof v === 'string' && v.length > 0;
  const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

  for (const n of raw.nodes ?? []) {
    if (!n || !validId(n.id) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      warnings.push('Dropped a node with a missing id or position.');
      continue;
    }
    if (seen.has(n.id)) {
      warnings.push(`Dropped duplicate id "${n.id}".`);
      continue;
    }
    seen.add(n.id);
    let kind = typeof n.kind === 'string' ? n.kind : 'generic';
    if (!PARTS[kind]) {
      warnings.push(`Unknown part "${kind}" became a custom box.`);
      kind = 'generic';
    }
    const part = PARTS[kind];
    let color = typeof n.color === 'string' ? n.color : null;
    if (color !== null && !HEX_COLOR.test(color)) {
      warnings.push(`Ignored invalid color on node "${n.id}".`);
      color = null;
    }
    let status = typeof n.status === 'string' ? n.status : null;
    if (status !== null && !NODE_STATUSES.includes(status)) {
      warnings.push(`Ignored unknown status "${status}" on node "${n.id}".`);
      status = null;
    }
    let flags = Array.isArray(n.flags) ? n.flags.filter((f) => NODE_FLAGS.includes(f)) : [];
    if (Array.isArray(n.flags) && flags.length !== n.flags.length) {
      warnings.push(`Dropped unknown flags on node "${n.id}".`);
    }
    doc.nodes.push({
      id: n.id, kind, x: n.x, y: n.y,
      w: num(n.w, part.w), h: num(n.h, part.h),
      label: typeof n.label === 'string' ? n.label : part.name,
      sublabel: typeof n.sublabel === 'string' ? n.sublabel : '',
      color,
      addr: typeof n.addr === 'string' ? n.addr : '',
      rail: typeof n.rail === 'string' ? n.rail : '',
      notes: typeof n.notes === 'string' ? n.notes : '',
      status,
      flags,
    });
  }

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const hasPort = (ref) => {
    if (!ref || typeof ref !== 'object') return false;
    const node = nodeById.get(ref.node);
    return !!node && getPart(node.kind).ports.some((p) => p.id === ref.port);
  };

  for (const w of raw.wires ?? []) {
    if (!w || !validId(w.id) || seen.has(w.id) || !hasPort(w.from) || !hasPort(w.to)) {
      warnings.push('Dropped a wire with a bad id or missing endpoint.');
      continue;
    }
    seen.add(w.id);
    let bus = typeof w.bus === 'string' ? w.bus : DEFAULT_BUS;
    if (!BUSES[bus]) {
      warnings.push(`Unknown bus "${bus}" became ${BUSES[DEFAULT_BUS].short}.`);
      bus = DEFAULT_BUS;
    }
    doc.wires.push({
      id: w.id, bus,
      from: { node: w.from.node, port: w.from.port },
      to: { node: w.to.node, port: w.to.port },
      label: typeof w.label === 'string' ? w.label : '',
    });
  }

  for (const z of raw.zones ?? []) {
    if (!z || !validId(z.id) || seen.has(z.id) || !Number.isFinite(z.x) || !Number.isFinite(z.y)
      || !Number.isFinite(z.w) || !Number.isFinite(z.h)) {
      warnings.push('Dropped a zone with a bad id or geometry.');
      continue;
    }
    seen.add(z.id);
    let zColor = typeof z.color === 'string' && HEX_COLOR.test(z.color) ? z.color : '#4a90d9';
    if (typeof z.color === 'string' && !HEX_COLOR.test(z.color)) {
      warnings.push(`Replaced invalid color on zone "${z.id}".`);
    }
    doc.zones.push({
      id: z.id, x: z.x, y: z.y, w: z.w, h: z.h,
      label: typeof z.label === 'string' ? z.label : 'Zone',
      color: zColor,
    });
  }

  for (const t of raw.notes ?? []) {
    if (!t || !validId(t.id) || seen.has(t.id) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      warnings.push('Dropped a note with a bad id or position.');
      continue;
    }
    seen.add(t.id);
    doc.notes.push({ id: t.id, x: t.x, y: t.y, text: typeof t.text === 'string' ? t.text : '' });
  }

  for (const s of raw.journey ?? []) {
    if (!s || !validId(s.id) || seen.has(s.id) || !s.view
      || !Number.isFinite(s.view.x) || !Number.isFinite(s.view.y) || !Number.isFinite(s.view.zoom)) {
      warnings.push('Dropped a journey step with a bad id or view.');
      continue;
    }
    seen.add(s.id);
    doc.journey.push({
      id: s.id,
      label: typeof s.label === 'string' ? s.label : 'Step',
      view: { x: s.view.x, y: s.view.y, zoom: Math.min(4, Math.max(0.2, s.view.zoom)) },
      caption: typeof s.caption === 'string' ? s.caption : '',
    });
  }

  return { doc, warnings };
}
