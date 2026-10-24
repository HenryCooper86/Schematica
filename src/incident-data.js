// The incident timeline a reconstructed board carries (doc.incident) and the
// replay state at any moment of it. Pure: the replay dock renders it, tests
// pin it, and it travels with the board through save, share and undo.
//
// doc.incident = {
//   title, blast?, phases: [{ name }],
//   events: [{ ts, last, phase, actor, target, action, count, note?, command?, evidence?, nodes: [id], wires: [id] }],
// }
// Events are clustered log steps in time order; `count` is how many logged
// actions the step stands for. Times are epoch milliseconds, shown in UTC.
import { tr } from './i18n.js';
import { CONDITIONS } from './palette.js';

export const MAX_EVENTS = 20000;
const MAX_FIELD = 500;
const clip = (v) => String(v ?? '').trim().slice(0, MAX_FIELD);

// Build from reconstructIncident's steps once the board exists.
export function buildIncident({ title, blast = '', phases, steps, idOf, wireBetween, stages = [] }) {
  // Stages in the order the log lists them, then any it only names inline.
  const stageNames = [...new Set([...stages, ...steps.map((s) => s.stage)].map(clip).filter(Boolean))];
  return {
    title: clip(title),
    ...(clip(blast) ? { blast: clip(blast) } : {}),
    ...(stageNames.length ? { stages: stageNames.map((name) => ({ name })) } : {}),
    phases: phases.map((p) => ({ name: clip(p.name) })),
    events: steps.slice(0, MAX_EVENTS).map((s) => {
      const from = idOf(s.actor), to = s.target ? idOf(s.target) : null;
      const wire = from && to ? wireBetween(from, to) : null;
      return {
        ts: s.ts, last: s.lastTs ?? s.ts, phase: clip(s.phase), actor: clip(s.actor), target: clip(s.target),
        action: clip(s.action), count: Math.max(1, s.count | 0),
        ...(s.stage ? { stage: clip(s.stage) } : {}),
        ...(s.note ? { note: clip(s.note) } : {}),
        ...(s.command ? { command: clip(s.command) } : {}),
        ...(s.evidence ? { evidence: clip(s.evidence) } : {}),
        ...(Object.hasOwn(CONDITIONS, s.condition) ? { condition: s.condition } : {}),
        nodes: [...new Set([from, to].filter(Boolean))],
        wires: wire ? [wire] : [],
      };
    }),
  };
}

// Validate an incident read from a file: drop what is malformed, keep ids
// that still exist on the board, and keep events in time order.
export function normalizeIncident(raw, doc, warnings = []) {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.events)) {
    warnings.push(tr('Dropped an invalid incident timeline.'));
    return undefined;
  }
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const wireIds = new Set(doc.wires.map((w) => w.id));
  const events = [];
  for (const e of raw.events.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object' || !Number.isFinite(e.ts)) continue;
    events.push({
      ts: e.ts, last: Number.isFinite(e.last) && e.last >= e.ts ? e.last : e.ts,
      phase: clip(e.phase), actor: clip(e.actor), target: clip(e.target), action: clip(e.action),
      count: Number.isInteger(e.count) && e.count > 0 ? Math.min(e.count, 1e7) : 1,
      ...(clip(e.stage) ? { stage: clip(e.stage) } : {}),
      ...(e.note ? { note: clip(e.note) } : {}),
      ...(e.command ? { command: clip(e.command) } : {}),
      ...(e.evidence ? { evidence: clip(e.evidence) } : {}),
      ...(typeof e.condition === 'string' && Object.hasOwn(CONDITIONS, e.condition) ? { condition: e.condition } : {}),
      nodes: (Array.isArray(e.nodes) ? e.nodes : []).filter((id) => nodeIds.has(id)),
      wires: (Array.isArray(e.wires) ? e.wires : []).filter((id) => wireIds.has(id)),
    });
  }
  if (!events.length) { warnings.push(tr('Dropped an incident timeline with no usable events.')); return undefined; }
  events.sort((a, b) => a.ts - b.ts);
  const named = (Array.isArray(raw.phases) ? raw.phases : []).map((p) => clip(p?.name)).filter(Boolean);
  for (const e of events) if (e.phase && !named.includes(e.phase)) named.push(e.phase);
  const stageNames = (Array.isArray(raw.stages) ? raw.stages : []).map((st) => clip(st?.name)).filter(Boolean);
  for (const e of events) if (e.stage && !stageNames.includes(e.stage)) stageNames.push(e.stage);
  return {
    title: clip(raw.title),
    ...(clip(raw.blast) ? { blast: clip(raw.blast) } : {}),
    ...(stageNames.length ? { stages: [...new Set(stageNames)].map((name) => ({ name })) } : {}),
    phases: [...new Set(named)].map((name) => ({ name })),
    events,
  };
}

const DAY = 86400000;
const dayStart = (ts) => Math.floor(ts / DAY) * DAY;

// The span the replay clock runs over and the UTC days it crosses.
export function incidentSpan(incident) {
  const events = incident.events;
  const start = events[0].ts, end = Math.max(...events.map((e) => e.last));
  const days = [];
  for (let d = dayStart(start); d <= end; d += DAY) days.push(d);
  return { start, end: end > start ? end : start + 60000, days };
}

// What an event leaves its target in. A log can say so outright with a
// `condition` on the action; otherwise the words of the action, phase,
// command and note are read for the usual incident vocabulary. The first
// matching rule wins, so "dumps credentials" is a compromise, not a breach,
// and an action the rules do not recognise sets nothing.
const CONDITION_RULES = [
  ['infected', /ransom|encrypt|malware|infect|implant|backdoor|beacon|trojan|worm/],
  ['exfil', /exfil|export|steal|stole|leak|upload.*(data|telemetry|archive)/],
  ['compromised', /credential|password|phish|login|logon|session|token|lateral|pivot|compromis|takeover|hijack|control/],
  ['breach', /breach|dump|database|records/],
  ['exploited', /\brce\b|exploit|cve-|code exec|shell|\broot\b|inject|overflow|deserial/],
  ['ddos', /ddos|\bdos\b|flood|amplif/],
  ['outage', /outage|offline|\bdown\b|crash|wipe|delet|destroy|halt|denied|unavailable/],
  ['vulnerable', /vuln|unpatched|exposed|misconfig|default password|open port/],
  ['suspicious', /recon|scan|enumerat|probe|brute|discover|sweep|unusual|anomal/],
];
export function conditionFor(event) {
  if (event.condition && Object.hasOwn(CONDITIONS, event.condition)) return event.condition;
  const text = [event.action, event.phase, event.command, event.note].filter(Boolean).join(' ').toLowerCase();
  if (!text) return null;
  for (const [condition, re] of CONDITION_RULES) if (re.test(text)) return condition;
  return null;
}

// The condition each reached part is in after event i: the latest event
// that targeted it decides. An actor-only event marks nothing; an action on
// a target marks the target.
export function replayConditions(events, i) {
  const out = new Map();
  for (const e of events.slice(0, i + 1)) {
    if (!e.target || !e.nodes.length) continue;
    const condition = conditionFor(e);
    if (!condition) continue;
    out.set(e.nodes.at(-1), condition);
  }
  return out;
}

// Index of the last event at or before t (-1 before the first).
export function eventIndexAt(events, t) {
  let lo = 0, hi = events.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].ts <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

// Everything the dock shows at event index i (inclusive).
export function replayState(incident, i, { streamSize = 6 } = {}) {
  const events = incident.events;
  const done = events.slice(0, i + 1);
  const perPhase = new Map(incident.phases.map((p) => [p.name, { count: 0, first: null, last: null, total: 0 }]));
  for (const e of events) {
    if (!perPhase.has(e.phase)) perPhase.set(e.phase, { count: 0, first: null, last: null, total: 0 });
    perPhase.get(e.phase).total += e.count;
  }
  const nodes = new Set(), wires = new Set();
  const perDay = new Map();
  for (const day of incidentSpan(incident).days) perDay.set(day, { count: 0, total: 0 });
  for (const e of events) perDay.get(dayStart(e.ts)).total += e.count;
  let actions = 0;
  for (const e of done) {
    actions += e.count;
    const p = perPhase.get(e.phase);
    p.count += e.count;
    p.first ??= e.ts;
    p.last = e.last;
    for (const id of e.nodes) nodes.add(id);
    for (const id of e.wires) wires.add(id);
    perDay.get(dayStart(e.ts)).count += e.count;
  }
  const current = done.at(-1) || null;
  // Each stage's span over the whole incident, and the phases it holds
  // (a phase belongs to the stage of its first event).
  const stages = (incident.stages || []).map((st, i) => {
    const own = events.filter((e) => e.stage === st.name);
    return { name: st.name, n: i + 1, first: own[0]?.ts ?? null, last: own.length ? Math.max(...own.map((e) => e.last)) : null,
      phases: [...new Set(own.map((e) => e.phase))].filter((ph) => events.find((e) => e.phase === ph)?.stage === st.name) };
  });
  return {
    actions,
    stage: current?.stage ? stages.find((st) => st.name === current.stage) || null : null,
    stages,
    total: events.reduce((sum, e) => sum + e.count, 0),
    phase: current?.phase || null,
    current,
    nodes, wires,
    conditions: replayConditions(events, i),
    reachedParts: nodes.size,
    perPhase: [...perPhase.entries()].map(([name, v]) => ({ name, ...v })),
    perDay: [...perDay.entries()].map(([ts, v]) => ({ ts, ...v })),
    stream: done.slice(-streamSize).reverse(),
  };
}

// "03-11 09:40" in UTC, and the full "2026-03-11 09:40 UTC".
const pad = (n) => String(n).padStart(2, '0');
export const utcShort = (ts) => { const d = new Date(ts); return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const utcLong = (ts) => { const d = new Date(ts); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
export const utcDay = (ts) => { const d = new Date(ts); return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
