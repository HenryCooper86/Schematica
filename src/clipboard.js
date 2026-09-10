// Copy and paste. A selection travels as one versioned JSON payload written
// to the system clipboard, so it crosses boards, tabs, and a browser restart.
// Everything here is pure: no DOM and no clipboard API — src/tools.js owns
// those and nothing else calls them. Two rules keep a paste coherent: a wire
// travels only when both of its endpoints do, and a custom card carries its
// own definition, exactly as it does inside a board file.
import { deserialize } from './serialize.js';
import { uid, SCHEMA_VERSION } from './state.js';
import { tr } from './i18n.js';

// The wrapper. `schematica: 'clip'` tells our payload from any other JSON a
// user may have copied; `v` is the wrapper's own version, while `schema`
// versions the items inside it and is migrated by the board loader.
export const CLIP_MARK = 'clip';
export const CLIP_VERSION = 1;

// A paste is a keystroke, not a file import: both caps sit well above any
// hand-drawn selection and well below what would stall the renderer or the
// JSON parser on a hostile payload.
export const MAX_CLIP_ITEMS = 500;
export const MAX_CLIP_CHARS = 4_000_000;

// How far a paste steps clear of what it lands on, and how many times it will
// step before it gives up and overlaps.
const PASTE_STEP = 16;
const MAX_CASCADE = 40;

const KINDS = ['nodes', 'wires', 'zones', 'notes'];

// What `ids` in `doc` put on the clipboard: the selected nodes, zones, and
// notes, plus every wire with both endpoints among them. A wire with one end
// outside the selection is dropped — the other end would have nothing to
// land on. Null when the selection holds nothing that can travel (only
// wires, or nothing at all).
export function buildClip(doc, ids) {
  const src = new Set(ids);
  const nodes = doc.nodes.filter((n) => src.has(n.id));
  const zones = doc.zones.filter((z) => src.has(z.id));
  const notes = doc.notes.filter((t) => src.has(t.id));
  if (!nodes.length && !zones.length && !notes.length) return null;
  const kept = new Set(nodes.map((n) => n.id));
  const wires = doc.wires.filter((w) => kept.has(w.from.node) && kept.has(w.to.node));
  return {
    schematica: CLIP_MARK,
    v: CLIP_VERSION,
    schema: Number.isInteger(doc.schema) ? doc.schema : SCHEMA_VERSION,
    // A custom node's `part` rides along inside the node, so a board that has
    // never seen that part still draws it.
    nodes: structuredClone(nodes),
    wires: structuredClone(wires),
    zones: structuredClone(zones),
    notes: structuredClone(notes),
  };
}

export function clipCount(clip) {
  return KINDS.reduce((n, k) => n + (Array.isArray(clip?.[k]) ? clip[k].length : 0), 0);
}

// Compact, not pretty-printed: this text goes to the clipboard, not to a file
// anyone reads.
export function encodeClip(clip) {
  return JSON.stringify(clip);
}

// The clipboard is untrusted input: it may hold ordinary text, a payload a
// hand edited, or one a newer build wrote. Throws a ready-to-show message
// when nothing usable is in there; otherwise returns the validated items and
// whatever the validator had to say about them.
export function readClip(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(tr('The clipboard holds nothing to paste.'));
  }
  if (text.length > MAX_CLIP_CHARS) {
    throw new Error(tr('That clipboard selection is too large to paste.'));
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(tr('The clipboard does not hold a copied selection.'));
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schematica !== CLIP_MARK) {
    throw new Error(tr('The clipboard does not hold a copied selection.'));
  }
  if (!Number.isInteger(raw.v) || raw.v < 1) {
    throw new Error(tr('The copied selection has no usable version.'));
  }
  const warnings = [];
  // A newer wrapper is read best-effort, the way the file loader reads a newer
  // file: whatever this build understands is pasted, the rest is dropped by
  // the validator below and counted in its warnings.
  if (raw.v > CLIP_VERSION) {
    warnings.push(tr('This selection was copied by a newer version of Schematica; pasting what this one understands.'));
  }
  const counted = clipCount(raw);
  if (counted > MAX_CLIP_ITEMS) {
    throw new Error(tr('A paste is limited to {max} items; this selection holds {n}.', { max: MAX_CLIP_ITEMS, n: counted }));
  }
  // The board loader is this app's one validator. Handing it a document-shaped
  // payload means a hand-edited clipboard can no more inject an unknown kind,
  // an out-of-range coordinate, an unbounded string, a duplicate id, or a
  // prototype-polluting key than a hand-edited file can — and a wire whose
  // port no longer exists is dropped there too.
  let clip;
  try {
    const loaded = deserialize(JSON.stringify({
      schema: raw.schema,
      nodes: raw.nodes,
      wires: raw.wires,
      zones: raw.zones,
      notes: raw.notes,
    }));
    clip = loaded.doc;
    warnings.push(...loaded.warnings);
  } catch {
    throw new Error(tr('The copied selection is malformed; nothing was pasted.'));
  }
  if (!clip.nodes.length && !clip.zones.length && !clip.notes.length) {
    throw new Error(tr('Nothing in the copied selection could be pasted.'));
  }
  return { clip, warnings };
}

// Where a pasted block lands. It keeps its internal layout, so only its
// corner is decided here. A block whose originals are still on this board is
// a second copy of them and steps clear; a block arriving on a board that
// never held them keeps the coordinates it was drawn at, so a subsystem
// carried between boards lands in the same place in the same coordinate
// space rather than drifting. Either way it steps again while an existing
// item sits exactly under one of its items, so pasting twice cascades
// instead of stacking out of sight.
export function pasteOffset(doc, clip, { step = PASTE_STEP } = {}) {
  const placed = [...clip.nodes, ...clip.zones, ...clip.notes];
  const here = [...doc.nodes, ...doc.zones, ...doc.notes];
  const ids = new Set(here.map((i) => i.id));
  const spots = new Set(here.map((i) => `${i.x},${i.y}`));
  let d = placed.some((i) => ids.has(i.id)) ? step : 0;
  for (let i = 0; i < MAX_CASCADE && placed.some((p) => spots.has(`${p.x + d},${p.y + d}`)); i += 1) {
    d += step;
  }
  return { dx: d, dy: d };
}

// The keys that make two custom definitions the same part. `lib` is left out
// on purpose: it is the link being judged, not part of the shape.
const DEF_KEYS = ['name', 'category', 'accent', 'icon', 'ports', 'fields'];
const defShape = (def) => JSON.stringify(DEF_KEYS.map((k) => def[k] ?? null));
function sameDefinition(a, b) {
  if (!a || !b) return false;
  return defShape(a) === defShape(b);
}

// The fresh items a paste adds, with no side effects. Mirrors duplicateItems
// in state.js — same order, same fresh ids, same rdksoftware target remap —
// over a validated payload rather than the board's own items. `taken` is
// every id already in use, `mint` is injectable so a test can watch a
// collision, and `known` answers what this board already means by a template
// id.
export function materializeClip(clip, {
  offset = { dx: 0, dy: 0 }, mint = uid, taken = new Set(), known = () => null,
} = {}) {
  const map = new Map(); // old node id -> new node id
  const ids = [];
  // Ids are random, so a collision is vanishingly unlikely; minting again is
  // cheaper than reasoning about what a collision would do to a wire.
  const fresh = (prefix) => {
    let id;
    do { id = mint(prefix); } while (taken.has(id));
    taken.add(id);
    ids.push(id);
    return id;
  };
  const moved = (item, id) => ({
    ...structuredClone(item), id, x: item.x + offset.dx, y: item.y + offset.dy,
  });

  const nodes = clip.nodes.map((n) => {
    const id = fresh('n');
    map.set(n.id, id);
    const node = moved(n, id);
    // A pasted custom card keeps its link to a template only when what this
    // board already knows under that id is the same definition. Otherwise the
    // link is cut: the card is still drawn exactly as it was copied, but a
    // template it never came from can no longer reshape it through "update
    // its siblings" — and pasting never writes to the reader's own library.
    if (node.kind === 'custom' && node.part?.lib && !sameDefinition(node.part, known(node.part.lib))) {
      delete node.part.lib;
    }
    return node;
  });
  // An RDK software stage names its board in a field, not with a wire; when
  // that board came along it must name the pasted copy.
  for (const n of nodes) {
    if (n.kind === 'rdksoftware' && map.has(n.fields?.target)) n.fields.target = map.get(n.fields.target);
  }
  const zones = clip.zones.map((z) => moved(z, fresh('z')));
  const notes = clip.notes.map((t) => moved(t, fresh('t')));
  const wires = clip.wires.map((w) => ({
    ...structuredClone(w),
    id: fresh('w'),
    from: { node: map.get(w.from.node), port: w.from.port },
    to: { node: map.get(w.to.node), port: w.to.port },
  }));
  return { nodes, wires, zones, notes, ids };
}

// Adds a validated payload to the board as one undo step and returns the new
// ids, so the caller can select exactly what it pasted. `templateFor` reads
// this browser's part library; the board's own custom cards are consulted
// first, since a card already here is what "the same part" means locally.
export function pasteInto(store, clip, { templateFor = () => null, mint = uid, offset = null } = {}) {
  const at = offset || pasteOffset(store.doc, clip);
  const taken = new Set([...store.doc.nodes, ...store.doc.wires, ...store.doc.zones, ...store.doc.notes]
    .map((i) => i.id));
  const known = (lib) => store.doc.nodes.find((n) => n.kind === 'custom' && n.part?.lib === lib)?.part
    ?? templateFor(lib);
  const made = materializeClip(clip, { offset: at, mint, taken, known });
  store.apply((doc) => {
    doc.nodes.push(...made.nodes);
    doc.zones.push(...made.zones);
    doc.notes.push(...made.notes);
    doc.wires.push(...made.wires);
  });
  return made.ids;
}

// What a copy or a cut says. Singular and plural are separate strings because
// a translator, not a rule in here, decides how a language counts. A cut
// reports what reached the clipboard; lockedKeptMessage explains separately
// what stayed on the board.
export function copiedMessage(n, { cut = false } = {}) {
  if (cut) return n === 1 ? tr('1 item cut to the clipboard.') : tr('{n} items cut to the clipboard.', { n });
  return n === 1 ? tr('1 item copied to the clipboard.') : tr('{n} items copied to the clipboard.', { n });
}

export function pastedMessage(n) {
  return n === 1 ? tr('1 item pasted.') : tr('{n} items pasted.', { n });
}
