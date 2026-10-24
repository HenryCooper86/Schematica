// Reconstruct a replayable attack chain from a log of timestamped actions.
// The input is an "incident log": a JSON object (or a bare array) of actions,
// each with a timestamp, an actor, an action, and optionally a target, note,
// phase and trust-boundary. Reconstruction clusters near-identical actions into
// ordered steps, groups them into phases, draws an editable board (actors and
// targets wired together, trust boundaries as zones), and produces a journey
// whose chapters are phases and whose stops are the chronological steps. The
// existing presentation player then replays it like the incident reference.
import { newDoc, uid } from './state.js';
import { applyEdits, MAX_OPS } from './ai/ops.js';
import { placeNew } from './ai/layout.js';
import { resolveStep } from './journey.js';
import { getPart } from './palette.js';
import { buildIncident, utcShort, validTime, MAX_SPAN_DAYS } from './incident-data.js';
import { nodeRect, noteHeight } from './geometry.js';

// Consecutive near-identical actions within this window collapse into one step.
export const CLUSTER_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_KIND = 'process';
const ZONE_COLOR = '#f59e0b';
const DISCLAIMER = 'Reconstructed from a log. Steps are what the log recorded, not independent proof of execution.';

function text(value) { return String(value ?? '').trim(); }

// Lay a reconstructed board out for reading: columns by how many hops a
// part is from where the activity starts (the attacker on the left, what it
// reaches directly next, what those reach further right), each column
// grouped by trust boundary and then by first appearance, with room for the
// action labels between columns. Zones are redrawn around their members and
// the disclaimer note sits above the first column.
const COLUMN_GAP = 220;
const ROW_GAP = 64;
const ZONE_GAP = 56;
function spreadLayout(doc, steps, idOf, zones) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const first = new Map();
  const out = new Map();
  const targets = new Set();
  steps.forEach((s, i) => {
    const a = idOf(s.actor), b = s.target ? idOf(s.target) : null;
    for (const id of [a, b]) if (id && !first.has(id)) first.set(id, i);
    if (a && b && a !== b) {
      targets.add(b);
      if (!out.has(a)) out.set(a, new Set());
      out.get(a).add(b);
    }
  });
  const ids = [...first.keys()].filter((id) => byId.has(id));
  if (!ids.length) return;
  const depth = new Map();
  const queue = ids.filter((id) => !targets.has(id));
  if (!queue.length) queue.push(ids[0]);
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    for (const next of out.get(id) || []) if (!depth.has(next)) { depth.set(next, depth.get(id) + 1); queue.push(next); }
  }
  for (const id of ids) if (!depth.has(id)) depth.set(id, 1);
  const zoneOf = new Map();
  zones.forEach((z, i) => z.members.forEach((id) => { if (!zoneOf.has(id)) zoneOf.set(id, i); }));
  const columns = [];
  for (const id of ids) (columns[depth.get(id)] ||= []).push(id);
  const rank = (id) => (zoneOf.has(id) ? zoneOf.get(id) : zones.length);
  const placed = columns.map((col) => {
    col.sort((a, b) => rank(a) - rank(b) || first.get(a) - first.get(b));
    let y = 0;
    const rows = col.map((id, i) => {
      if (i && rank(id) !== rank(col[i - 1])) y += ZONE_GAP;
      const row = { id, y };
      y += nodeRect(byId.get(id)).h + ROW_GAP;
      return row;
    });
    return { rows, height: y - ROW_GAP, width: Math.max(...col.map((id) => nodeRect(byId.get(id)).w)) };
  });
  const tallest = Math.max(...placed.map((c) => c.height));
  const top = 200;
  let x = 40;
  for (const column of placed) {
    if (!column) continue;
    const offset = top + (tallest - column.height) / 2;
    for (const row of column.rows) {
      const n = byId.get(row.id);
      n.x = Math.round(x + (column.width - nodeRect(n).w) / 2);
      n.y = Math.round(offset + row.y);
    }
    x += column.width + COLUMN_GAP;
  }
  // Two or more hops out, a part lines up with whatever reaches it (pushed
  // down only as far as the one above it needs).
  const parents = new Map();
  for (const [a, set] of out) for (const b of set) { if (!parents.has(b)) parents.set(b, []); parents.get(b).push(a); }
  for (let d = 2; d < columns.length; d++) {
    if (!columns[d]) continue;
    const wanted = columns[d].map((id) => {
      const ups = (parents.get(id) || []).filter((p) => depth.get(p) < d).map((p) => byId.get(p));
      const n = byId.get(id);
      const y = ups.length ? ups.reduce((sum, u) => sum + u.y + nodeRect(u).h / 2, 0) / ups.length - nodeRect(n).h / 2 : n.y;
      return { n, y };
    }).sort((a, b) => a.y - b.y);
    let floor = -Infinity;
    for (const w of wanted) { w.n.y = Math.round(Math.max(w.y, floor)); floor = w.n.y + nodeRect(w.n).h + ROW_GAP; }
  }
  for (const z of zones) {
    const zone = doc.zones.find((item) => item.id === z.id);
    const rects = z.members.map((id) => byId.get(id)).filter(Boolean).map(nodeRect);
    if (!zone || !rects.length) continue;
    const x0 = Math.min(...rects.map((r) => r.x)) - 28, y0 = Math.min(...rects.map((r) => r.y)) - 36;
    const x1 = Math.max(...rects.map((r) => r.x + r.w)) + 28, y1 = Math.max(...rects.map((r) => r.y + r.h)) + 28;
    Object.assign(zone, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const note = doc.notes.find((t) => t.text.startsWith(DISCLAIMER));
  if (note) {
    const lead = placed.find(Boolean)?.rows[0];
    const leadNode = lead && byId.get(lead.id);
    note.x = 40;
    note.y = Math.round(Math.min(top + (tallest - (placed[0]?.height ?? 0)) / 2, leadNode ? leadNode.y : top) - noteHeight(note.text) - 40);
  }
}

export function parseIncidentLog(input) {
  let data;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw Error('The incident log is not valid JSON.');
  }
  const rawActions = Array.isArray(data) ? data : (data && data.actions);
  if (!Array.isArray(rawActions) || !rawActions.length) {
    throw Error('The incident log has no actions. Expect {"actions": [{"ts", "actor", "action", ...}]}.');
  }
  const actions = rawActions.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error(`Action ${i + 1} is not an object.`);
    // A board stores epoch milliseconds, so a log may give them as numbers
    // as well as any date string Date.parse reads.
    const raw = entry.ts ?? entry.time ?? entry.timestamp;
    const ts = typeof raw === 'number' ? raw : Date.parse(text(raw));
    if (!validTime(ts)) throw Error(`Action ${i + 1} has no valid timestamp.`);
    const actor = text(entry.actor || entry.from) || 'actor';
    const action = text(entry.action || entry.event || entry.type) || 'action';
    return {
      ts, actor, action,
      target: text(entry.target || entry.to || entry.dest),
      note: text(entry.note || entry.detail || entry.description),
      phase: text(entry.phase),
      boundary: text(entry.boundary),
      kind: text(entry.kind),
      // What was run and what the log shows came of it, for the replay's
      // action stream. Both optional; shown as recorded.
      stage: text(entry.stage),
      command: text(entry.command || entry.cmd),
      evidence: text(entry.evidence || entry.output || entry.result),
      // What the action left its target in, when the log says so
      // (compromised, infected, outage, ...); otherwise the replay infers it.
      condition: text(entry.condition || entry.state).toLowerCase(),
    };
  }).sort((a, b) => a.ts - b.ts);
  // The replay walks the span day by day, so it is bounded like the board's
  // own timeline is on load.
  if (actions.at(-1).ts - actions[0].ts > MAX_SPAN_DAYS * 86400000) {
    throw Error(`The incident log spans more than ${MAX_SPAN_DAYS} days.`);
  }
  const incident = text(data && !Array.isArray(data) ? (data.incident || data.title) : '');
  const boundaries = (data && !Array.isArray(data) && Array.isArray(data.trustBoundaries))
    ? data.trustBoundaries.map((b, i) => ({ id: text(b && b.id) || `zone-${i + 1}`, name: text(b && b.name) || `Boundary ${i + 1}` }))
    : [];
  const nodeKinds = (data && !Array.isArray(data) && data.nodes && typeof data.nodes === 'object') ? data.nodes : {};
  const blast = text(data && !Array.isArray(data) ? data.blastRadius || data.blast : '');
  // Optional stages that group phases: [{ id, name }] or plain names; an
  // action names its stage by id or name.
  const stageList = (data && !Array.isArray(data) && Array.isArray(data.stages) ? data.stages : [])
    .map((st, i) => (typeof st === 'string' ? { id: st, name: st } : { id: text(st && st.id) || `stage-${i + 1}`, name: text(st && st.name) || text(st && st.id) || `Stage ${i + 1}` }));
  for (const a of actions) {
    const named = stageList.find((st) => st.id === a.stage || st.name === a.stage);
    if (named) a.stage = named.name;
  }
  return { incident, actions, boundaries, nodeKinds, blast, stages: stageList.map((st) => st.name) };
}

export function reconstructIncident(parsed) {
  const { incident, actions, boundaries, nodeKinds, blast = '', stages = [] } = parsed;

  // Cluster near-identical consecutive actions into one ordered step.
  const steps = [];
  for (const action of actions) {
    const last = steps[steps.length - 1];
    const phase = action.phase || action.action;
    if (last && last.phase === phase && last.actor === action.actor && last.action === action.action
      && last.target === action.target && action.ts - last.lastTs <= CLUSTER_WINDOW_MS) {
      last.lastTs = action.ts;
      last.count += 1;
      if (action.note && !last.note) last.note = action.note;
      if (action.command && !last.command) last.command = action.command;
      if (action.evidence && !last.evidence) last.evidence = action.evidence;
      if (action.condition) last.condition = action.condition;
    } else {
      steps.push({
        ts: action.ts, lastTs: action.ts, actor: action.actor, action: action.action,
        target: action.target, note: action.note, phase, boundary: action.boundary,
        kind: action.kind, count: 1, command: action.command, evidence: action.evidence, stage: action.stage,
        condition: action.condition,
      });
    }
  }

  // Phases in order of first appearance, with per-phase timing and volume.
  const phaseNames = [];
  const phaseSet = new Set();
  for (const step of steps) if (!phaseSet.has(step.phase)) { phaseSet.add(step.phase); phaseNames.push(step.phase); }
  const phases = phaseNames.map((name) => {
    const owned = steps.filter((s) => s.phase === name);
    return {
      name,
      firstSeen: Math.min(...owned.map((s) => s.ts)),
      lastSeen: Math.max(...owned.map((s) => s.lastTs)),
      count: owned.reduce((sum, s) => sum + s.count, 0),
    };
  });

  // Unique actors and targets, with an optional kind hint from the log.
  const names = []; // display names, in first-seen order
  const kinds = new Map(); // name -> palette kind
  for (const step of steps) {
    for (const name of [step.actor, step.target]) {
      if (!name || kinds.has(name)) continue;
      kinds.set(name, step.kind || nodeKinds[name] || DEFAULT_KIND);
      names.push(name);
    }
  }
  const refOf = new Map(names.map((name, i) => [name, `n${i}`]));

  const doc = newDoc(incident || 'Incident');
  const ops = [];
  for (const name of names) {
    ops.push({ op: 'add_part', ref: refOf.get(name), kind: kinds.get(name), label: name });
  }

  // Trust boundaries become zones around the nodes the log assigns to them.
  const boundaryId = new Set(boundaries.map((b) => b.id));
  const zoneMembers = new Map(); // boundary id -> [node refs]
  for (const step of steps) {
    const nodeName = step.target || step.actor;
    if (!step.boundary || !boundaryId.has(step.boundary) || !nodeName || !refOf.has(nodeName)) continue;
    if (!zoneMembers.has(step.boundary)) zoneMembers.set(step.boundary, []);
    zoneMembers.get(step.boundary).push(refOf.get(nodeName));
  }
  for (const boundary of boundaries) {
    const members = [...new Set(zoneMembers.get(boundary.id) || [])];
    if (!members.length) continue;
    ops.push({ op: 'add_zone', ref: `z${boundary.id}`, label: boundary.name, color: ZONE_COLOR, members });
  }

  // One directed wire per unique actor -> target edge, labelled by the first action.
  const edges = new Map();
  for (const step of steps) {
    if (!step.target || !step.actor || step.actor === step.target) continue;
    const key = `${step.actor}\u0000${step.target}`;
    if (!edges.has(key)) edges.set(key, step.action);
  }
  // A wire's bus must be one its ends actually have, or every reconstructed
  // wire is a bus-mismatch finding: a logical link when either end has link
  // ports (threats), otherwise a bus both parts share, else a plain flow.
  const busesOf = (name) => new Set(getPart(kinds.get(name)).ports.map((p) => p.bus));
  const busFor = (a, b) => {
    const from = busesOf(a), to = busesOf(b);
    if (from.has('link') || to.has('link')) return 'link';
    return [...from].find((bus) => to.has(bus) && bus !== 'power' && bus !== 'gnd') || 'flow';
  };
  for (const [key, action] of edges) {
    const [actor, target] = key.split('\u0000');
    ops.push({
      op: 'connect',
      from: { node: refOf.get(actor) },
      to: { node: refOf.get(target) },
      bus: busFor(actor, target), arrow: 'fwd', label: action,
    });
  }

  // Apply atomically in bounded batches, translating refs into real ids as
  // earlier batches create them. The whole reconstruction fails (board
  // untouched) if any batch is rejected.
  const snapshot = JSON.parse(JSON.stringify(doc));
  const refToId = {};
  const idOf = (name) => refToId[refOf.get(name)] ?? null;
  const translate = (op) => {
    const resolve = (ref) => refToId[ref] ?? ref;
    if (op.op === 'add_zone') return { ...op, members: op.members.map(resolve) };
    if (op.op === 'connect') {
      return { ...op, from: { ...op.from, node: resolve(op.from.node) }, to: { ...op.to, node: resolve(op.to.node) } };
    }
    return op;
  };
  try {
    for (let i = 0; i < ops.length; i += MAX_OPS) {
      const batch = ops.slice(i, i + MAX_OPS).map(translate);
      const result = applyEdits(doc, batch);
      if (!result.ok) {
        throw Error(`Incident reconstruction rejected: ${result.errors.map((e) => `#${e.index}: ${e.message}`).join('; ')}`);
      }
      Object.assign(refToId, result.refs);
      placeNew(doc, result.layout);
    }
    const disclaimer = doc.notes.find((note) => note.text.startsWith(DISCLAIMER));
    if (!disclaimer && names.length) {
      const anchor = idOf(names[0]);
      if (anchor) {
        const result = applyEdits(doc, [{ op: 'add_note', ref: 'd', near: anchor, text: `${DISCLAIMER} ${incident || ''}`.trim() }]);
        if (result.ok) { Object.assign(refToId, result.refs); placeNew(doc, result.layout); }
      }
    }
  } catch (error) {
    Object.assign(doc, snapshot);
    throw error;
  }

  spreadLayout(doc, steps, idOf, boundaries.map((b) => ({
    id: refToId[`z${b.id}`],
    members: [...new Set((zoneMembers.get(b.id) || []).map((ref) => refToId[ref]).filter(Boolean))],
  })).filter((z) => z.id));

  // Build the journey: a chapter per phase, stops in chronological order.
  const stopCaption = (step) => {
    const parts = [utcShort(step.ts)];
    parts.push(step.target ? `${step.actor} → ${step.target}` : step.actor);
    parts.push(step.action);
    if (step.count > 1) parts.push(`×${step.count}`);
    if (step.note || step.evidence) parts.push(step.note || step.evidence);
    return parts.join(' · ');
  };
  const timeline = steps.map((step) => ({ ...step, node: idOf(step.target || step.actor) }));
  for (const phase of phaseNames) {
    const owned = steps.filter((s) => s.phase === phase);
    const nodes = [...new Set(owned.map((s) => idOf(s.target || s.actor)).filter(Boolean))];
    const chapter = {
      id: uid('j'),
      label: `Phase: ${phase}`,
      caption: `${phase} — ${owned.reduce((sum, s) => sum + s.count, 0)} logged action(s).`,
      view: { cx: 0, cy: 0, zoom: 1 },
      stops: owned.map((step) => ({ id: uid('s'), node: idOf(step.target || step.actor), caption: stopCaption(step) })),
      targets: { nodes, wires: [] },
    };
    chapter.view = resolveStep(doc, chapter).view;
    doc.journey.push(chapter);
  }

  // Per-day action volume, in UTC, for the replay dashboard.
  const dayCounts = new Map();
  for (const action of actions) {
    const d = new Date(action.ts);
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }
  const days = [...dayCounts.entries()].map(([ts, count]) => ({
    ts, label: `${String(new Date(ts).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(ts).getUTCDate()).padStart(2, '0')}`, count,
  })).sort((a, b) => a.ts - b.ts);

  // The timeline travels with the board so the replay works after save,
  // share and reload.
  doc.incident = buildIncident({
    title: incident, blast, phases, steps, idOf, stages,
    wireBetween: (a, b) => doc.wires.find((w) => w.from.node === a && w.to.node === b)?.id || null,
  });
  return { doc, timeline, phases, days };
}
