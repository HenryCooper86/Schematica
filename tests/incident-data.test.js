import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIncidentLog, reconstructIncident } from '../src/incident-replay.js';
import { replayState, eventIndexAt, incidentSpan, normalizeIncident, utcLong, utcShort } from '../src/incident-data.js';
import { serialize, deserialize } from '../src/serialize.js';

const log = {
  incident: 'IR-T',
  blastRadius: 'contained to the test channel',
  trustBoundaries: [{ id: 'cloud', name: 'Cloud' }],
  nodes: { attacker: 'threatactor', api: 'server', store: 'database' },
  actions: [
    { ts: '2026-03-11T08:00:00Z', actor: 'attacker', action: 'recon', target: 'api', phase: 'recon', command: 'nmap -sV api', evidence: '443/tcp open' },
    { ts: '2026-03-11T08:01:00Z', actor: 'attacker', action: 'recon', target: 'api', phase: 'recon', command: 'curl -I api' },
    { ts: '2026-03-11T09:00:00Z', actor: 'attacker', action: 'rce', target: 'api', phase: 'rce', command: 'id', evidence: 'uid=0(root)' },
    { ts: '2026-03-12T02:00:00Z', actor: 'attacker', action: 'exfil', target: 'store', phase: 'exfil', boundary: 'cloud' },
  ],
};
const build = () => reconstructIncident(parseIncidentLog(JSON.stringify(log))).doc;

test('a reconstructed board carries its timeline, with commands, evidence and the blast radius', () => {
  const doc = build();
  const inc = doc.incident;
  assert.equal(inc.title, 'IR-T');
  assert.equal(inc.blast, 'contained to the test channel');
  assert.deepEqual(inc.phases.map((p) => p.name), ['recon', 'rce', 'exfil']);
  assert.equal(inc.events.length, 3, 'two recon actions a minute apart cluster into one event');
  assert.equal(inc.events[0].count, 2);
  assert.equal(inc.events[0].command, 'nmap -sV api', 'the first command represents the cluster');
  assert.equal(inc.events[1].evidence, 'uid=0(root)');
  const ids = new Set(doc.nodes.map((n) => n.id));
  for (const e of inc.events) for (const id of e.nodes) assert.ok(ids.has(id));
  assert.ok(inc.events.every((e) => e.wires.length === 1 && doc.wires.some((w) => w.id === e.wires[0])));
});

test('the timeline survives save and load unchanged', () => {
  const doc = build();
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(back.incident, doc.incident);
});

test('loading drops events pointing at removed items and rejects a malformed timeline', () => {
  const doc = build();
  const raw = JSON.parse(serialize(doc));
  raw.nodes = raw.nodes.filter((n) => n.label !== 'store');
  raw.wires = raw.wires.filter((w) => raw.nodes.some((n) => n.id === w.to.node) && raw.nodes.some((n) => n.id === w.from.node));
  const { doc: back } = deserialize(JSON.stringify(raw));
  assert.ok(back.incident.events.every((e) => e.nodes.every((id) => back.nodes.some((n) => n.id === id))));
  const warnings = [];
  assert.equal(normalizeIncident({ events: 'nope' }, back, warnings), undefined);
  assert.equal(warnings.length, 1);
  assert.equal(normalizeIncident({ events: [{ ts: 'x' }] }, back, []), undefined);
});

test('replay state accumulates actions, phases, reach, days and the stream up to the clock', () => {
  const inc = build().incident;
  const span = incidentSpan(inc);
  assert.equal(span.days.length, 2, 'the incident crosses two UTC days');
  assert.equal(eventIndexAt(inc.events, span.start - 1), -1);
  const before = replayState(inc, -1);
  assert.equal(before.actions, 0);
  assert.equal(before.nodes.size, 0);
  assert.equal(before.total, 4);
  const mid = replayState(inc, eventIndexAt(inc.events, Date.parse('2026-03-11T10:00:00Z')));
  assert.equal(mid.actions, 3);
  assert.equal(mid.phase, 'rce');
  assert.deepEqual(mid.perPhase.map((p) => [p.name, p.count, p.total]), [['recon', 2, 2], ['rce', 1, 1], ['exfil', 0, 1]]);
  assert.deepEqual(mid.perDay.map((d) => [d.count, d.total]), [[3, 3], [0, 1]]);
  assert.equal(mid.stream[0].action, 'rce', 'newest first');
  assert.equal(mid.nodes.size, 2);
  const end = replayState(inc, inc.events.length - 1);
  assert.equal(end.actions, 4);
  assert.equal(end.nodes.size, 3);
});

test('times are shown in UTC regardless of the viewer', () => {
  const ts = Date.parse('2026-03-11T08:04:00Z');
  assert.equal(utcShort(ts), '03-11 08:04');
  assert.equal(utcLong(ts), '2026-03-11 08:04 UTC');
});

test('stages group phases: named by id or name, in log order, with their span and phases', () => {
  const staged = {
    ...log,
    stages: [{ id: 's1', name: 'Reaching the API' }, { id: 's2', name: 'Taking data' }],
    actions: log.actions.map((a, i) => ({ ...a, stage: i < 3 ? 's1' : 'Taking data' })),
  };
  const doc = reconstructIncident(parseIncidentLog(JSON.stringify(staged))).doc;
  assert.deepEqual(doc.incident.stages, [{ name: 'Reaching the API' }, { name: 'Taking data' }]);
  assert.equal(doc.incident.events[0].stage, 'Reaching the API');
  const s = replayState(doc.incident, 1);
  assert.equal(s.stage.name, 'Reaching the API');
  assert.equal(s.stage.n, 1);
  assert.deepEqual(s.stages.map((st) => st.phases), [['recon', 'rce'], ['exfil']]);
  assert.equal(s.stages[1].first, Date.parse('2026-03-12T02:00:00Z'));
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(back.incident, doc.incident, 'stages survive save and load');
});

test('a log without stages has none and the replay shows no stage', () => {
  const s = replayState(build().incident, 0);
  assert.equal(build().incident.stages, undefined);
  assert.equal(s.stage, null);
  assert.deepEqual(s.stages, []);
});
