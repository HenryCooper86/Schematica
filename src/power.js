// Current accounting: a tolerant reader for the figures people type on a card,
// and the power tree built from the drawn power wires. Pure, DOM-free, and
// deliberately narrow - it sums declared currents per rail. It does not model
// conversion efficiency, duty cycle, inrush, or voltage, so nothing here can
// prove a supply is adequate; it only says what the board says about itself.

import { nodePart } from './rdk/profiles.js';

// SI prefixes a datasheet line may carry, as multipliers straight into the
// milli unit everything here works in. Micro is written three ways in the wild
// (the sign, the Greek letter, and a plain "u"), so all three read.
const SCALE = { '': 1e3, k: 1e6, m: 1, u: 1e-3, 'µ': 1e-3, 'μ': 1e-3 };
const NUMBER = '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))';

// One number with an optional SI prefix and unit, and nothing else after it,
// so "2000mAh" can never be read as a current. A bare number is accepted and
// taken in the milli unit, which is how people write both mA and mAh. The
// result is in milli units; null means "there is nothing to read here", which
// is not the same as zero.
function quantity(text, unit) {
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : null;
  if (typeof text !== 'string') return null;
  const s = text.trim().toLowerCase();
  if (!s) return null;
  const m = new RegExp(`^${NUMBER}\\s*(?:([kmuµμ])\\s*)?(${unit})?$`).exec(s);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  // A prefix with no unit ("250m") is a typo, not a figure: refuse it rather
  // than guess which unit was meant.
  if (m[2] && !m[3]) return null;
  // Scaling in binary floating point leaves dust ("350mA" lands on
  // 350.00000000000006); a nanoamp is finer than any of these figures, so
  // round there and let sums stay exact.
  if (!m[3]) return value;
  return Math.round(value * SCALE[m[2] ?? ''] * 1e6) / 1e6;
}

// "250mA", "0.25 A", "250 ma", "1.2A", "3.6uA", or a bare 250 meaning 250 mA.
export function parseCurrentMa(text) {
  return quantity(text, 'a');
}

// "2000mAh", "2 Ah", or a bare 2000 meaning 2000 mAh.
export function parseCapacityMah(text) {
  return quantity(text, 'ah');
}

// Two decimals is as far as any of these figures is meaningful, and trailing
// zeros only make a rail total harder to read.
const trim = (v) => String(Math.round(v * 100) / 100);

// Below a milliamp a sleeping sensor reads better in microamps, and a rail
// total reads better in amps once it passes a thousand milliamps.
export function formatCurrent(ma) {
  if (ma == null || !Number.isFinite(ma)) return '';
  if (ma === 0) return '0 mA';
  if (ma < 1) return `${trim(ma * 1000)} µA`;
  if (ma < 1000) return `${trim(ma)} mA`;
  return `${trim(ma / 1000)} A`;
}

// Cells are sold in mAh up to a few thousand and in Ah beyond that.
export function formatCapacity(mah) {
  if (mah == null || !Number.isFinite(mah)) return '';
  return mah < 10000 ? `${trim(mah)} mAh` : `${trim(mah / 1000)} Ah`;
}

export function formatHours(h) {
  if (h == null || !Number.isFinite(h)) return '';
  return h < 10 ? trim(Math.round(h * 10) / 10) : String(Math.round(h));
}

// ---- The power tree ----

// Connected components over the wires of one bus. The I2C rule wants nodes
// joined by I2C wires; the power rules want the same walk with port-aware
// vertices, so both go through here and there is only one traversal.
// `vertexOf(ref)` names the vertex a wire endpoint lands on; the default is
// the node itself. Returns one array of vertex names per component.
export function busComponents(doc, bus, vertexOf = (ref) => ref.node) {
  const parent = new Map();
  const find = (a) => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  for (const w of doc.wires) {
    if (w.bus !== bus) continue;
    const a = vertexOf(w.from);
    const b = vertexOf(w.to);
    if (a == null || b == null) continue;
    union(a, b);
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()];
}

// A separator a node id cannot contain, so a vertex splits back cleanly.
const SEP = '\u0000';

// Which rail a power pin belongs to. A part that declares `passes` carries one
// rail straight through (a fuse, a fuse box, a charger whose OUT sits on the
// cell), so all of those pins are one vertex. A part that declares `feeds`
// pushes current out of those pins, and they are its supply side - kept apart
// from its own draw pins so a regulator's input and output are two rails, not
// one. Every other power pin draws, each on its own vertex.
export function railVertex(part, nodeId, portId) {
  if ((part.passes || []).includes(portId)) return `${nodeId}${SEP}pass`;
  if ((part.feeds || []).includes(portId)) return `${nodeId}${SEP}feed`;
  return `${nodeId}${SEP}${portId}`;
}

const fieldOf = (node, id) => node.fields?.[id];

// What one part says about itself: what it draws, what it can deliver, what it
// stores. Any of them may be null.
export function partCurrents(node) {
  return {
    typicalMa: parseCurrentMa(fieldOf(node, 'ityp')),
    peakMa: parseCurrentMa(fieldOf(node, 'ipeak')),
    limitMa: parseCurrentMa(fieldOf(node, 'imax')),
    capacityMah: parseCapacityMah(fieldOf(node, 'capacity')),
  };
}

// The current a part draws for the budget. A plain consumer draws what it
// declares. A part that also feeds a rail is a regulator, and it draws two
// things at once on its input: its own quiescent current, if it stated one,
// plus the whole load of the rail it feeds - a regulator does not stop
// delivering current because it also declared what it burns idling. Carrying
// the load across ignores the conversion ratio and the efficiency, so it is a
// rough figure: about right for a linear regulator, high for a step-down
// converter, low for a step-up one. Where the rail it feeds cannot be summed,
// its own declared figure is all there is to report.
function drawOf(entry, rails, load, guard) {
  const { node, currents } = entry;
  const declared = currents.typicalMa != null || currents.peakMa != null;
  const ownTypical = currents.typicalMa ?? currents.peakMa ?? 0;
  const ownPeak = currents.peakMa ?? currents.typicalMa ?? 0;
  const fed = rails.findIndex((r) => r.sources.some((s) => s.node.id === node.id));
  if (fed >= 0 && !guard.has(fed)) {
    const downstream = load(fed, guard);
    if (downstream.known) {
      return {
        typicalMa: ownTypical + downstream.typicalMa,
        peakMa: ownPeak + downstream.peakMa,
        known: true,
        carried: true,
      };
    }
  }
  if (declared) return { typicalMa: ownTypical, peakMa: ownPeak, known: true, carried: false };
  return { typicalMa: 0, peakMa: 0, known: false, carried: false };
}

// The power tree: one entry per rail, in the order the wires build them.
// A rail is a set of pins that share a supply; `sources` are the parts feeding
// it, `draws` the parts hanging off it.
export function powerRails(doc) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const partOfId = new Map(doc.nodes.map((n) => [n.id, nodePart(n)]));
  const vertexOf = (ref) => {
    const part = partOfId.get(ref.node);
    return part ? railVertex(part, ref.node, ref.port) : null;
  };

  const rails = busComponents(doc, 'power', vertexOf).map((vertices) => {
    const sources = new Map();
    const draws = new Map();
    // A pass-through part is neither end of the rail, but it is in series with
    // all of it: a fuse's rating is a limit on the whole rail's current, so it
    // is kept rather than dropped.
    const passes = new Map();
    for (const v of vertices) {
      const cut = v.indexOf(SEP);
      const id = v.slice(0, cut);
      const kind = v.slice(cut + 1);
      const node = byId.get(id);
      if (!node) continue;
      const bucket = kind === 'pass' ? passes : (kind === 'feed' ? sources : draws);
      if (!bucket.has(id)) bucket.set(id, { node, currents: partCurrents(node) });
    }
    return { sources: [...sources.values()], draws: [...draws.values()], passes: [...passes.values()] };
  }).filter((r) => r.sources.length || r.draws.length);

  // Rails resolve in whatever order they are asked for; `guard` holds the
  // rails already being summed so a regulator wired in a ring (its own output
  // feeding its input, however that came about) stops instead of recursing.
  const cache = new Map();
  const load = (index, guard) => {
    if (cache.has(index)) return cache.get(index);
    const rail = rails[index];
    const next = new Set(guard).add(index);
    let typicalMa = 0;
    let peakMa = 0;
    // The parts that contribute nothing, by id rather than only by count, so a
    // reader can be shown which datasheets are still missing.
    const unknownIds = [];
    let declared = false;
    for (const entry of rail.draws) {
      if (entry.currents.typicalMa != null || entry.currents.peakMa != null) declared = true;
      const d = drawOf(entry, rails, load, next);
      if (!d.known) { unknownIds.push(entry.node.id); continue; }
      typicalMa += d.typicalMa;
      peakMa += d.peakMa;
    }
    const known = rail.draws.length > unknownIds.length;
    const result = { typicalMa, peakMa, unknown: unknownIds.length, unknownIds, known, declaredDraw: declared };
    // Only a complete answer is worth keeping: a partial one computed inside a
    // guard could differ from the same rail asked for on its own.
    if (!guard.size) cache.set(index, result);
    return result;
  };

  return rails.map((rail, i) => {
    const summed = load(i, new Set());
    const declaredLimit = rail.sources.some((s) => s.currents.limitMa != null);
    const declaredCell = rail.sources.some((s) => s.currents.capacityMah != null);
    // What the rail could deliver: the limits its supplies declare, added up.
    // Adding them is an upper bound and nothing more - two regulators wired in
    // parallel do not share a load evenly unless they were built to, and none
    // of that is modelled here - so the sum is only worth comparing against
    // when every supply on the rail stated one, which `limitComplete` says.
    const limits = rail.sources.map((s) => s.currents.limitMa).filter((v) => v != null && v > 0);
    return {
      sources: rail.sources,
      draws: rail.draws,
      passes: rail.passes,
      typicalMa: summed.typicalMa,
      peakMa: summed.peakMa,
      unknown: summed.unknown,
      unknownIds: summed.unknownIds,
      // Whether anything on this rail opted into the budget at all. A board
      // that declares no currents gets no findings and no numbers.
      declared: summed.declaredDraw || declaredLimit || declaredCell,
      declaredDraw: summed.declaredDraw,
      declaredLimit,
      limitMa: limits.length ? limits.reduce((a, b) => a + b, 0) : null,
      limitComplete: limits.length > 0 && limits.length === rail.sources.length,
    };
  });
}

// Runtime in hours from a capacity and an average draw. Zero or unknown draw
// has no answer; it is not an infinite one.
export function runtimeHours(capacityMah, ma) {
  if (capacityMah == null || ma == null || !(ma > 0)) return null;
  return capacityMah / ma;
}

// The power tree as something to read rather than something to judge: one row
// per rail with its supplies, its rating, its two sums, the parts that said
// nothing, and any runtime. Every rail is listed, including the ones no rule
// would report, because the point of the list is to see the tree at all.
// Labels are the user's own text; formatting and translation belong to the
// caller. `ids` is the whole rail, so a row can select itself on the board.
export function powerSummary(doc) {
  return powerRails(doc).map((rail) => {
    const byId = new Map(rail.draws.map((e) => [e.node.id, e]));
    return {
      sources: rail.sources.map((s) => s.node.label),
      passes: rail.passes.map((p) => ({ label: p.node.label, limitMa: p.currents.limitMa })),
      limitMa: rail.limitMa,
      limitComplete: rail.limitComplete,
      typicalMa: rail.typicalMa,
      peakMa: rail.peakMa,
      declared: rail.declared,
      // Whether the two sums mean anything: at least one part on the rail
      // contributed a figure, its own or one carried up from below. A rail
      // where nobody said anything has no total, which is not the same as a
      // total of zero, and a reader must never be shown the second for the
      // first.
      summed: rail.draws.length > rail.unknown,
      undeclared: rail.unknownIds.map((id) => byId.get(id).node.label),
      runtimes: rail.sources
        .map((s) => ({ label: s.node.label, capacityMah: s.currents.capacityMah, hours: runtimeHours(s.currents.capacityMah, rail.typicalMa) }))
        .filter((r) => r.hours != null),
      ids: [...rail.sources, ...rail.passes, ...rail.draws].map((e) => e.node.id),
    };
  });
}

// The typical current one part declares, summed for the whole board. Used by
// the bill of materials, which counts parts rather than rails, so a part that
// is not wired to a supply still shows what it draws.
export function declaredTypicalMa(nodes) {
  let total = null;
  for (const node of nodes) {
    const { typicalMa, peakMa } = partCurrents(node);
    const ma = typicalMa ?? peakMa;
    if (ma == null) continue;
    total = (total ?? 0) + ma;
  }
  return total;
}
