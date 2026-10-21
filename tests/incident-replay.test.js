import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIncidentLog, reconstructIncident, CLUSTER_WINDOW_MS } from '../src/incident-replay.js';
import { deserialize, serialize } from '../src/serialize.js';

const log = () => ({
  incident: 'IR-2026-07',
  trustBoundaries: [{ id: 'pub', name: 'PUBLIC INTERNET' }, { id: 'sbx', name: 'SANDBOX' }],
  nodes: { attacker: 'threatactor', sandbox: 'server' },
  actions: [
    { ts: '2026-07-09T02:28:00Z', actor: 'attacker', action: 'recon', target: 'sandbox', phase: 'recon', boundary: 'sbx' },
    { ts: '2026-07-09T02:29:00Z', actor: 'attacker', action: 'recon', target: 'sandbox', phase: 'recon', note: 'scan' },
    { ts: '2026-07-09T04:01:00Z', actor: 'attacker', action: 'rce', target: 'sandbox', phase: 'rce', boundary: 'sbx', note: 'uid=0' },
    { ts: '2026-07-10T03:00:00Z', actor: 'attacker', action: 'exfil', target: 's3', phase: 'exfil', note: 'env dump' },
  ],
});

test('parseIncidentLog accepts an object and a bare action array', () => {
  const object = parseIncidentLog(JSON.stringify(log()));
  assert.equal(object.incident, 'IR-2026-07');
  assert.equal(object.actions.length, 4);
  assert.equal(object.boundaries.length, 2);
  assert.equal(object.nodeKinds.sandbox, 'server');

  const bare = parseIncidentLog(JSON.stringify(log().actions));
  assert.equal(bare.actions.length, 4);
  assert.equal(bare.boundaries.length, 0);
});

test('parseIncidentLog rejects malformed input with a clear message', () => {
  assert.throws(() => parseIncidentLog('not json'), /not valid JSON/);
  assert.throws(() => parseIncidentLog('{}'), /no actions/);
  assert.throws(() => parseIncidentLog(JSON.stringify([{ ts: 'garbage', actor: 'a', action: 'x' }])), /no valid timestamp/);
});

test('reconstructIncident clusters near-identical actions and groups phases', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  // Two recon actions within the window collapse into one step with count 2.
  assert.equal(result.timeline.length, 3);
  assert.equal(result.timeline[0].action, 'recon');
  assert.equal(result.timeline[0].count, 2);
  assert.equal(result.timeline[0].note, 'scan');
  assert.deepEqual(result.phases.map((p) => p.name), ['recon', 'rce', 'exfil']);
  assert.equal(result.phases[0].count, 2);
  assert.equal(result.phases[1].count, 1);
});

test('reconstructIncident draws actors, targets, edges and trust-boundary zones', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  const labels = result.doc.nodes.map((n) => n.label).sort();
  assert.deepEqual(labels, ['attacker', 's3', 'sandbox']);
  assert.equal(result.doc.nodes.find((n) => n.label === 'attacker').kind, 'threatactor');
  assert.equal(result.doc.nodes.find((n) => n.label === 'sandbox').kind, 'server');
  // attacker -> sandbox and attacker -> s3, both directed.
  assert.equal(result.doc.wires.length, 2);
  for (const wire of result.doc.wires) {
    assert.equal(wire.arrow, 'fwd');
    assert.ok(result.doc.nodes.some((n) => n.id === wire.from.node));
    assert.ok(result.doc.nodes.some((n) => n.id === wire.to.node));
  }
  assert.equal(result.doc.zones.length, 1);
  assert.equal(result.doc.zones[0].label, 'SANDBOX');
});

test('reconstructIncident produces a journey chapter per phase with chronological stops', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  assert.equal(result.doc.journey.length, 3);
  const rce = result.doc.journey.find((c) => c.label === 'Phase: rce');
  assert.ok(rce);
  assert.equal(rce.stops.length, 1);
  assert.match(rce.stops[0].caption, /uid=0/);
  assert.match(rce.stops[0].caption, /attacker → sandbox/);
  const nodeIds = new Set(result.doc.nodes.map((n) => n.id));
  for (const stop of rce.stops) assert.ok(nodeIds.has(stop.node));
});

test('reconstructed boards round-trip through serialize and deserialize', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  const round = deserialize(serialize(result.doc));
  assert.equal(round.doc.nodes.length, result.doc.nodes.length);
  assert.equal(round.doc.wires.length, result.doc.wires.length);
  assert.equal(round.doc.journey.length, result.doc.journey.length);
  for (const node of round.doc.nodes) assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
});

test('reconstructIncident reports per-day action volume for the dashboard', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  assert.deepEqual(result.days.map((d) => d.count), [3, 1]);
  assert.deepEqual(result.days.map((d) => d.label), ['07-09', '07-10']);
});

test('a log with no actor-to-target edges still reconstructs and replays', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify({
    actions: [{ ts: '2026-07-09T02:28:00Z', actor: 'solo', action: 'check', note: 'probe' }],
  })));
  assert.equal(result.doc.nodes.length, 1);
  assert.equal(result.doc.wires.length, 0);
  assert.equal(result.timeline.length, 1);
  assert.equal(result.doc.journey.length, 1);
});
