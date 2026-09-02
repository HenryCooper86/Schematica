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
  const validId = (v) => typeof v === 'string' && v.length > 0;
  const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
  const coerced = new Set(); // nodes whose unknown kind became a custom box

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
      coerced.add(n.id);
    }
    const part = PARTS[kind];
    const dim = (v, fallback, what) => {
      if (v === undefined) return fallback;
      if (Number.isFinite(v) && v > 0) return v;
      warnings.push(`Replaced invalid ${what} on node "${n.id}".`);
      return fallback;
    };
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
      w: dim(n.w, part.w, 'width'), h: dim(n.h, part.h, 'height'),
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
  // A wire endpoint on a node whose unknown kind became a custom box loses its
  // original ports; keep the wire by moving it onto a generic side port.
  const resolvePort = (ref, fallbackPort) => {
    if (!ref || typeof ref !== 'object') return null;
    const node = nodeById.get(ref.node);
    if (!node) return null;
    if (getPart(node.kind).ports.some((p) => p.id === ref.port)) {
      return { node: ref.node, port: ref.port, remapped: false };
    }
    if (coerced.has(ref.node)) return { node: ref.node, port: fallbackPort, remapped: true };
    return null;
  };

  for (const w of raw.wires ?? []) {
    const from = w ? resolvePort(w.from, 'right') : null;
    const to = w ? resolvePort(w.to, 'left') : null;
    if (!w || !validId(w.id) || seen.has(w.id) || !from || !to) {
      warnings.push('Dropped a wire with a bad id or missing endpoint.');
      continue;
    }
    seen.add(w.id);
    if (from.remapped || to.remapped) {
      warnings.push(`Wire "${w.id}" was moved onto the custom box's generic ports.`);
    }
    let bus = typeof w.bus === 'string' ? w.bus : DEFAULT_BUS;
    if (!BUSES[bus]) {
      warnings.push(`Unknown bus "${bus}" became ${BUSES[DEFAULT_BUS].short}.`);
      bus = DEFAULT_BUS;
    }
    doc.wires.push({
      id: w.id, bus,
      from: { node: from.node, port: from.port },
      to: { node: to.node, port: to.port },
      label: typeof w.label === 'string' ? w.label : '',
      arrow: w.arrow === 'fwd' || w.arrow === 'both' ? w.arrow : null,
      style: ['solid', 'dashed', 'dotted'].includes(w.style) ? w.style : null,
    });
  }

  for (const z of raw.zones ?? []) {
    if (!z || !validId(z.id) || seen.has(z.id) || !Number.isFinite(z.x) || !Number.isFinite(z.y)
      || !(Number.isFinite(z.w) && z.w > 0) || !(Number.isFinite(z.h) && z.h > 0)) {
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
    const v = s?.view;
    const modern = v && Number.isFinite(v.cx) && Number.isFinite(v.cy);
    const legacy = v && Number.isFinite(v.x) && Number.isFinite(v.y);
    if (!s || !validId(s.id) || seen.has(s.id) || !v
      || !Number.isFinite(v.zoom) || (!modern && !legacy)) {
      warnings.push('Dropped a journey step with a bad id or view.');
      continue;
    }
    seen.add(s.id);
    const zoom = Math.min(4, Math.max(0.2, v.zoom));
    // Legacy views stored raw screen offsets; convert to an approximate world
    // center assuming the historical ~1280x800 canvas.
    const view = modern
      ? { cx: v.cx, cy: v.cy, zoom }
      : { cx: (640 - v.x) / zoom, cy: (400 - v.y) / zoom, zoom };
    doc.journey.push({
      id: s.id,
      label: typeof s.label === 'string' ? s.label : 'Step',
      view,
      caption: typeof s.caption === 'string' ? s.caption : '',
    });
  }

  return { doc, warnings };
}
