// Custom parts. A node of kind "custom" carries its own definition in
// `node.part`: name, category, accent, icon, typed ports, and extra fields.
// This module owns the one validator every producer uses (the part editor,
// the file loader, the assistant's edit operations) and the resolver that
// turns a custom node into a catalogue-shaped part for the rest of the app.
// Port offsets are never stored: ports on a side are spaced evenly in list
// order, so reordering the list is the whole positioning story.
import { PARTS, CATEGORIES, getPart } from './palette.js';
import { BUSES } from './buses.js';
import { tr } from './i18n.js';

export const LIMITS = {
  name: 60, ports: 24, portName: 12, id: 24, fields: 8, fieldLabel: 40,
  options: 20, option: 40, placeholder: 40, path: 2000, text: 3, lib: 40, library: 200,
};
export const SIDES = ['left', 'right', 'top', 'bottom'];
// Display name of a side; the side value itself is data.
export function sideLabel(side) {
  return { left: tr('left'), right: tr('right'), top: tr('top'), bottom: tr('bottom') }[side] || String(side);
}
// SVG path data: commands, numbers, separators. Nothing that could close an
// attribute or open a tag survives this.
export const PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9\s,.eE+-]+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// Trims and collapses internal whitespace (including newlines) to single
// spaces: a name or label can never break the assistant's one-line board
// text or a DRC message onto a second line.
const str = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

// Up to two letters for a badge with no icon: "Motor driver x4" -> "MD".
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const s = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return s.toUpperCase();
}

// Ports on one side sit at (i+1)/(n+1) of that edge, in list order. The
// list order is kept so "the first port of a bus" means the same thing here
// as in the definition.
export function portsWithOffsets(ports) {
  const count = {};
  const seen = {};
  for (const p of ports) count[p.side] = (count[p.side] || 0) + 1;
  return ports.map((p) => {
    seen[p.side] = (seen[p.side] || 0) + 1;
    return { ...p, offset: Math.round((seen[p.side] / (count[p.side] + 1)) * 1000) / 1000 };
  });
}

// An icon is one of { kind }, { text }, { path }. Anything else that was
// written on purpose (a string, a number, an array, an empty object) is
// reported, so a hand-edited file learns why its icon did not show; only an
// absent icon falls back silently.
function normalizeIcon(raw, name, warnings) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (typeof raw.kind === 'string' && Object.hasOwn(PARTS, raw.kind)) return { kind: raw.kind };
    const text = str(raw.text);
    if (text && text.length <= LIMITS.text) return { text };
    const path = str(raw.path);
    if (path && path.length <= LIMITS.path && /^[Mm]/.test(path) && PATH_RE.test(path)) return { path };
  }
  if (raw != null) warnings.push(tr('Icon on "{name}" was not usable; using initials.', { name }));
  return { text: initials(name) };
}

// Two passes: every valid explicit id (a non-empty string of at most
// LIMITS.id chars matching ID_RE) is reserved first, the first entry to want
// a given id winning it — a later entry asking for the same id is treated as
// having none. Entries with no valid id then get the next free `<prefix><n>`
// that skips every reserved id. So an explicit id always outranks a
// generated one and a wire saved on it never drifts onto the wrong pin.
// `ids` is the raw ids of every entry that will make it into the output, in
// order, and the returned allocator must be called once per entry in that
// same order.
function idAllocator(prefix, ids) {
  const isValid = (id) => id && id.length <= LIMITS.id && ID_RE.test(id);
  const reserved = new Set();
  for (const raw of ids) {
    const id = str(raw);
    if (isValid(id)) reserved.add(id);
  }
  const taken = new Set();
  let counter = 0;
  return (wanted) => {
    const id = str(wanted);
    if (isValid(id) && reserved.has(id) && !taken.has(id)) {
      taken.add(id);
      return id;
    }
    let fresh;
    do { counter += 1; fresh = `${prefix}${counter}`; } while (reserved.has(fresh) || taken.has(fresh));
    taken.add(fresh);
    return fresh;
  };
}

function normalizePorts(raw, name, warnings) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { warnings.push(tr('Ports on "{name}" must be a list; ignored.', { name })); return []; }
  const kept = [];
  const names = new Set();
  for (const p of raw.slice(0, LIMITS.ports)) {
    const pname = str(p?.name).slice(0, LIMITS.portName);
    const side = SIDES.includes(p?.side) ? p.side : null;
    if (!pname || !side) { warnings.push(tr('Dropped a port on "{name}" with no name or side.', { name })); continue; }
    const key = `${side}|${pname.toLowerCase()}`;
    if (names.has(key)) { warnings.push(tr('Dropped duplicate port "{port}" on the {side} of "{name}".', { port: pname, side: sideLabel(side), name })); continue; }
    names.add(key);
    kept.push({ p, pname, side });
  }
  const nextId = idAllocator('p', kept.map(({ p }) => p.id));
  const ports = kept.map(({ p, pname, side }) => {
    let bus = typeof p.bus === 'string' ? p.bus : '';
    if (!Object.hasOwn(BUSES, bus)) {
      warnings.push(tr('Port "{port}" on "{name}" has unknown bus "{bus}"; using GPIO.', { port: pname, name, bus }));
      bus = 'gpio';
    }
    return { id: nextId(p.id), name: pname, side, bus, required: p.required === true };
  });
  if (raw.length > LIMITS.ports) warnings.push(tr('"{name}" keeps the first {max} ports.', { name, max: LIMITS.ports }));
  return ports;
}

function normalizeFields(raw, name, warnings) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { warnings.push(tr('Fields on "{name}" must be a list; ignored.', { name })); return []; }
  const kept = [];
  for (const f of raw.slice(0, LIMITS.fields)) {
    const label = str(f?.label).slice(0, LIMITS.fieldLabel);
    if (!label) { warnings.push(tr('Dropped a field on "{name}" with no label.', { name })); continue; }
    kept.push({ f, label });
  }
  const nextId = idAllocator('f', kept.map(({ f }) => f.id));
  const fields = kept.map(({ f, label }) => {
    const field = { id: nextId(f.id), label };
    if (f.options !== undefined) {
      const options = Array.isArray(f.options)
        ? [...new Set(f.options.map((o) => str(o).slice(0, LIMITS.option)).filter(Boolean))].slice(0, LIMITS.options)
        : [];
      if (options.length >= 2) field.options = options;
      else warnings.push(tr('Field "{label}" on "{name}" needs at least two choices; it is free text.', { label, name }));
    }
    const placeholder = str(f.placeholder).slice(0, LIMITS.placeholder);
    if (placeholder) field.placeholder = placeholder;
    return field;
  });
  if (raw.length > LIMITS.fields) warnings.push(tr('"{name}" keeps the first {max} fields.', { name, max: LIMITS.fields }));
  return fields;
}

// The power-tree markers (see power.js): `feeds` names the pins current leaves
// the part by, `passes` the pins that carry one rail straight through. Only an
// id this same definition declares as a port survives, so a hand-written or
// hostile file can never name a pin that does not exist, let alone smuggle a
// value of another shape through into the rail walk.
function normalizePins(raw, ports, name, key, warnings) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) { warnings.push(tr('"{key}" on "{name}" must be a list of port ids; ignored.', { key, name })); return undefined; }
  const ids = new Set(ports.map((p) => p.id));
  // A pin named twice is a duplicate, not a foreign port: compare against the
  // deduplicated list so an honest file does not get a warning about smuggling.
  const uniq = [...new Set(raw)];
  const kept = uniq.filter((v) => typeof v === 'string' && ids.has(v));
  if (kept.length !== uniq.length) warnings.push(tr('"{key}" on "{name}" may only name its own ports; the rest were dropped.', { key, name }));
  return kept.length ? kept : undefined;
}

// The one validator. Returns a fresh, clean definition plus warnings for
// everything it changed or dropped, or `part: null` when there is nothing
// usable (no name). Unknown keys are ignored.
export function normalizePart(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { part: null, warnings: [tr('Custom part definition is missing.')] };
  const name = str(raw.name).slice(0, LIMITS.name);
  if (!name) return { part: null, warnings: [tr('Custom part has no name.')] };
  let category = raw.category;
  if (!CATEGORY_IDS.has(category)) {
    if (category !== undefined) warnings.push(tr('Unknown category "{category}" on "{name}"; using Storage / Misc.', { category, name }));
    category = 'misc';
  }
  let accent = null;
  if (typeof raw.accent === 'string' && HEX_COLOR.test(raw.accent)) accent = raw.accent;
  else if (raw.accent != null) warnings.push(tr('Ignored invalid accent on "{name}".', { name }));
  const lib = str(raw.lib);
  const ports = normalizePorts(raw.ports, name, warnings);
  const feeds = normalizePins(raw.feeds, ports, name, 'feeds', warnings);
  const passes = normalizePins(raw.passes, ports, name, 'passes', warnings);
  const part = {
    ...(lib && lib.length <= LIMITS.lib && ID_RE.test(lib) ? { lib } : {}),
    name,
    category,
    accent,
    icon: normalizeIcon(raw.icon, name, warnings),
    ports,
    fields: normalizeFields(raw.fields, name, warnings),
    // Absent markers stay absent rather than becoming empty lists, so a
    // definition that says nothing about power round-trips unchanged.
    ...(feeds ? { feeds } : {}),
    ...(passes ? { passes } : {}),
    ...(raw.trio === true ? { trio: true } : {}),
  };
  return { part, warnings };
}

// A custom node resolved to the shape the rest of the app reads from PARTS.
// Memoized on the definition object: render passes pay nothing, and an undo
// snapshot (a fresh object) resolves once more.
const memo = new WeakMap();
export function partOf(node) {
  if (!node || node.kind !== 'custom' || !node.part || typeof node.part !== 'object') return getPart(node?.kind);
  const def = node.part;
  let part = memo.get(def);
  if (!part) {
    part = {
      kind: 'custom',
      custom: true,
      name: def.name,
      category: def.category,
      accent: def.accent ?? null,
      ports: portsWithOffsets(def.ports || []),
      fields: def.fields?.length ? def.fields : undefined,
      lib: def.lib,
      // The power tree reads feeds/passes off the resolved part, so a
      // customized regulator keeps heading its own rail instead of turning
      // into a consumer sitting on its own output. `trio` rides along for the
      // round trip only: a custom part already shows both the address/rail
      // pair and its schema fields, which is what the flag asks for.
      ...(def.feeds?.length ? { feeds: def.feeds } : {}),
      ...(def.passes?.length ? { passes: def.passes } : {}),
      ...(def.trio ? { trio: true } : {}),
    };
    const icon = def.icon || {};
    if (icon.kind && Object.hasOwn(PARTS, icon.kind)) {
      const src = PARTS[icon.kind];
      if (src.glyph) part.glyph = src.glyph;
      else part.icon = src.icon;
    } else if (icon.path) {
      part.icon = icon.path;
    } else {
      part.text = icon.text || initials(def.name);
    }
    memo.set(def, part);
  }
  return part;
}

// When a definition is replaced (the assistant's update_part with `custom`),
// matched new ports reuse their old port's id, so wires keep pointing at them.
// Unmatched new ports keep their given id when that id is neither an old port's id
// nor already assigned in this merge; otherwise they get a fresh p<n> that avoids
// old ids, the new list's given ids, and assigned ids. So wires on changed pins
// get new ids and can never land on the wrong pin. `kept` is the set of old ids
// that survived.
export function mergePortIds(oldPorts, newPorts) {
  const free = new Map();
  for (const p of oldPorts) {
    const k = p.name.toLowerCase();
    if (!free.has(k)) free.set(k, []);
    free.get(k).push(p);
  }
  const kept = new Set();
  const oldIds = new Set(oldPorts.map((p) => p.id));
  const newIds = new Set(newPorts.map((p) => p.id));

  // Match ports by name/side preference
  const matched = newPorts.map((p) => {
    const cands = free.get(p.name.toLowerCase()) || [];
    const i = cands.findIndex((o) => o.side === p.side);
    const old = i >= 0 ? cands.splice(i, 1)[0] : cands.shift();
    if (!old) return null;
    kept.add(old.id);
    return old.id;
  });

  // Build used set for fresh ID generation
  const assigned = new Set(matched.filter(Boolean));
  const used = new Set([...oldIds, ...newIds, ...assigned]);

  let counter = 0;
  const fresh = () => {
    let id;
    do { counter += 1; id = `p${counter}`; } while (used.has(id));
    used.add(id);
    return id;
  };

  // Assign final ids: keep matched, try to keep uncontested given ids, or generate fresh
  const assignedIds = new Set();
  const ports = newPorts.map((p, i) => {
    if (matched[i]) {
      assignedIds.add(matched[i]);
      return { ...p, id: matched[i] };
    }
    // Unmatched: try to keep given id if available (not an old id, not already assigned)
    if (!oldIds.has(p.id) && !assignedIds.has(p.id)) {
      assignedIds.add(p.id);
      return { ...p, id: p.id };
    }
    // Otherwise generate fresh
    const freshId = fresh();
    assignedIds.add(freshId);
    return { ...p, id: freshId };
  });

  return { ports, kept };
}

// The same for fields: matched new fields reuse their old field's id so values
// keyed by field id survive a definition change. Unmatched new fields keep their
// given id when that id is neither an old field's id nor already assigned in this
// merge; otherwise they get a fresh f<n> that avoids old ids, the new list's given
// ids, and assigned ids.
export function mergeFieldIds(oldFields, newFields) {
  const free = new Map();
  for (const f of oldFields) {
    const k = f.label.toLowerCase();
    if (!free.has(k)) free.set(k, []);
    free.get(k).push(f);
  }
  const oldIds = new Set(oldFields.map((f) => f.id));
  const newIds = new Set(newFields.map((f) => f.id));

  // Match fields by label
  const matched = newFields.map((f) => (free.get(f.label.toLowerCase()) || []).shift()?.id ?? null);

  // Build used set for fresh ID generation
  const assigned = new Set(matched.filter(Boolean));
  const used = new Set([...oldIds, ...newIds, ...assigned]);

  let counter = 0;
  const fresh = () => {
    let id;
    do { counter += 1; id = `f${counter}`; } while (used.has(id));
    used.add(id);
    return id;
  };

  // Assign final ids: keep matched, try to keep uncontested given ids, or generate fresh
  const assignedIds = new Set();
  return newFields.map((f, i) => {
    if (matched[i]) {
      assignedIds.add(matched[i]);
      return { ...f, id: matched[i] };
    }
    // Unmatched: try to keep given id if available (not an old id, not already assigned)
    if (!oldIds.has(f.id) && !assignedIds.has(f.id)) {
      assignedIds.add(f.id);
      return { ...f, id: f.id };
    }
    // Otherwise generate fresh
    const freshId = fresh();
    assignedIds.add(freshId);
    return { ...f, id: freshId };
  });
}

// ---- Helpers for the part editor and the properties panel ----

// Choices as the editor types them ("a, b, c") or as a list.
export function optionList(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(arr.map((o) => str(o)).filter(Boolean))];
}

// What the editor must fix before Save is enabled. Unlike normalizePart,
// which repairs, this reports. The raw draft is the editor's shape:
// `fields[].options` may be a comma-separated string.
export function draftProblems(raw) {
  const problems = [];
  const name = str(raw?.name);
  if (!name) problems.push(tr('Name is required.'));
  else if (name.length > LIMITS.name) problems.push(tr('Name is too long ({max} max).', { max: LIMITS.name }));
  const ports = Array.isArray(raw?.ports) ? raw.ports : [];
  if (ports.length > LIMITS.ports) problems.push(tr('Too many ports ({max} max).', { max: LIMITS.ports }));
  const seen = new Set();
  ports.forEach((p, i) => {
    const pname = str(p?.name);
    if (!pname) { problems.push(tr('Port {n} needs a name.', { n: i + 1 })); return; }
    if (pname.length > LIMITS.portName) problems.push(tr('Port "{port}" name is too long ({max} max).', { port: pname, max: LIMITS.portName }));
    const key = `${p.side}|${pname.toLowerCase()}`;
    if (seen.has(key)) problems.push(tr('Two ports named "{port}" on the {side}.', { port: pname, side: sideLabel(p.side) }));
    seen.add(key);
  });
  const icon = raw?.icon || {};
  if (icon.path !== undefined) {
    const path = str(icon.path);
    if (!(path && path.length <= LIMITS.path && /^[Mm]/.test(path) && PATH_RE.test(path))) problems.push(tr('Icon path must be SVG path data starting with M.'));
  }
  if (icon.text !== undefined) {
    const text = str(icon.text);
    if (!(text.length >= 1 && text.length <= LIMITS.text)) problems.push(tr('Initials are 1 to {max} characters.', { max: LIMITS.text }));
  }
  const fields = Array.isArray(raw?.fields) ? raw.fields : [];
  if (fields.length > LIMITS.fields) problems.push(tr('Too many fields ({max} max).', { max: LIMITS.fields }));
  fields.forEach((f, i) => {
    const label = str(f?.label);
    if (!label) { problems.push(tr('Field {n} needs a label.', { n: i + 1 })); return; }
    const typed = f.options !== undefined && f.options !== null && String(f.options).trim() !== '';
    if (typed) {
      const options = optionList(f.options);
      if (options.length < 2) problems.push(tr('Field "{label}" needs two or more choices.', { label }));
      if (options.length > LIMITS.options) problems.push(tr('Field "{label}" has too many choices ({max} max).', { label, max: LIMITS.options }));
      if (options.some((o) => o.length > LIMITS.option)) problems.push(tr('Field "{label}" has a choice longer than {max} characters.', { label, max: LIMITS.option }));
    }
  });
  return problems;
}

// A definition to start from when customizing a built-in part: its name,
// category, accent, icon (by kind), ports with their ids kept so wires
// survive, supply pins marked required the way the checks treat them, and
// its schema fields as plain fields. Takes a resolved part (nodePart(node)),
// so an RDK profile's ports come through. Renames later ports with duplicate
// names on the same side by appending " 2", " 3", etc., keeping ids unchanged.
export function definitionFrom(part) {
  // The same pins the checks require on a built-in (drc.js rule 2).
  const supply = (p) => (p.bus === 'power' || p.bus === 'gnd') && (p.id === 'vcc' || p.id === 'gnd');
  const filtered = part.ports.filter((p) => !p.unsupported);

  // Track name counts by side to rename duplicates
  const nameCounts = new Map(); // key: "side|lowerName", value: { baseSliced, count }
  const ports = filtered.map((p) => {
    const baseNameSliced = p.name.slice(0, LIMITS.portName);
    const key = `${p.side}|${baseNameSliced.toLowerCase()}`;
    const entry = nameCounts.get(key);
    let finalName;
    if (!entry) {
      nameCounts.set(key, { baseSliced: baseNameSliced, count: 1 });
      finalName = baseNameSliced;
    } else {
      entry.count += 1;
      // Append " 2", " 3", etc., ensuring the digit survives truncation
      const suffix = ` ${entry.count}`;
      finalName = entry.baseSliced.slice(0, LIMITS.portName - suffix.length) + suffix;
    }
    return {
      id: p.id, name: finalName, side: p.side, bus: p.bus, required: supply(p),
    };
  });

  // Ports that were filtered out above must not survive in a marker list.
  const kept = new Set(ports.map((p) => p.id));
  const pins = (list) => (list || []).filter((id) => kept.has(id));
  const feeds = pins(part.feeds);
  const passes = pins(part.passes);

  return {
    name: part.name,
    category: part.category,
    accent: part.accent || null,
    icon: { kind: part.kind },
    ports,
    fields: (part.fields || []).map((f) => ({
      id: f.id,
      label: f.label.slice(0, LIMITS.fieldLabel),
      ...(f.options ? { options: [...f.options] } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    })),
    // Customizing a regulator, a supply or a fuse must not quietly take it out
    // of the power budget: the markers that put it in the rail walk travel
    // with its ports and fields.
    ...(feeds.length ? { feeds } : {}),
    ...(passes.length ? { passes } : {}),
    ...(part.trio ? { trio: true } : {}),
  };
}

// Every other custom node stamped from the same template as `node`.
export function siblings(doc, node) {
  const lib = node?.part?.lib;
  if (!lib || node.kind !== 'custom') return [];
  return doc.nodes.filter((n) => n.id !== node.id && n.kind === 'custom' && n.part?.lib === lib);
}

// Gives a node a normalized definition: it becomes a custom node, wires on
// ports the definition no longer has are dropped, values of fields that no
// longer exist are dropped, everything else on the node stays. Returns how
// many wires went. Callers clone the definition per node so two nodes never
// share one object.
export function applyDefinition(doc, nodeId, def) {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return { dropped: 0 };
  node.kind = 'custom';
  node.part = def;
  const ids = new Set(def.ports.map((p) => p.id));
  const before = doc.wires.length;
  doc.wires = doc.wires.filter((w) => (w.from.node !== nodeId || ids.has(w.from.port))
    && (w.to.node !== nodeId || ids.has(w.to.port)));
  if (node.fields) {
    const known = new Set(def.fields.map((f) => f.id));
    for (const k of Object.keys(node.fields)) if (!known.has(k)) delete node.fields[k];
    if (!Object.keys(node.fields).length) delete node.fields;
  }
  return { dropped: before - doc.wires.length };
}
