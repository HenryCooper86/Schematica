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

test('reconstructed wires use a bus their ends have, so no wire is a bus mismatch', async () => {
  const { checkDoc } = await import('../src/drc.js');
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  assert.deepEqual(checkDoc(result.doc).filter((f) => f.rule === 'bus-mismatch'), []);
  assert.ok(result.doc.wires.every((w) => w.bus === 'link'), 'a threat actor links logically');
});

test('a reconstructed board is laid out for reading: attacker left, hops to the right, no overlaps', async () => {
  const { checkLayout } = await import('../src/layout-checks.js');
  const { zoneMembers } = await import('../src/geometry.js');
  const doc = reconstructIncident(parseIncidentLog(JSON.stringify({
    trustBoundaries: [{ id: 'c', name: 'Cloud' }, { id: 'f', name: 'Field' }],
    nodes: { a: 'threatactor', api: 'server', ota: 'server', db: 'database', bot: 'aisbc' },
    actions: [
      { ts: '2026-03-11T08:00:00Z', actor: 'a', action: 'login', target: 'api', boundary: 'c' },
      { ts: '2026-03-11T08:10:00Z', actor: 'a', action: 'upload', target: 'ota', boundary: 'c' },
      { ts: '2026-03-11T08:20:00Z', actor: 'ota', action: 'push', target: 'bot', boundary: 'f' },
      { ts: '2026-03-11T08:30:00Z', actor: 'a', action: 'export', target: 'db', boundary: 'c' },
    ],
  }))).doc;
  const at = (label) => doc.nodes.find((n) => n.label === label);
  assert.ok(at('a').x < at('api').x && at('api').x < at('bot').x, 'columns follow hops from the attacker');
  assert.equal(at('bot').y, at('ota').y, 'a part two hops out lines up with what reaches it');
  assert.deepEqual(checkLayout(doc), []);
  for (const z of doc.zones) assert.ok(zoneMembers(doc, z).length, `${z.label} contains its parts`);
});

test('stop captions carry the UTC time the rest of the replay shows, whatever the local zone', () => {
  const result = reconstructIncident(parseIncidentLog(JSON.stringify(log())));
  const { stops } = result.doc.journey[0];
  assert.ok(stops[0].caption.startsWith('07-09 02:28 · '), stops[0].caption);
});

test('an incident log may give epoch-millisecond timestamps as numbers', () => {
  const ts = Date.parse('2026-07-09T02:28:00Z');
  const parsed = parseIncidentLog(JSON.stringify([{ ts, actor: 'a', action: 'x' }, { time: ts + 60000, actor: 'a', action: 'y' }]));
  assert.deepEqual(parsed.actions.map((a) => a.ts), [ts, ts + 60000]);
  assert.throws(() => parseIncidentLog(JSON.stringify([{ ts: NaN, actor: 'a', action: 'x' }])), /no valid timestamp/);
  assert.throws(() => parseIncidentLog(JSON.stringify([{ ts: 1e300, actor: 'a', action: 'x' }])), /no valid timestamp/);
});

test('an incident log spanning more than a year is refused rather than drawn day by day', () => {
  const DAY = 86400000, ts = Date.parse('2026-01-01T00:00:00Z');
  assert.throws(() => parseIncidentLog(JSON.stringify([{ ts, actor: 'a', action: 'x' }, { ts: ts + 400 * DAY, actor: 'a', action: 'y' }])), /spans more than/);
  assert.ok(parseIncidentLog(JSON.stringify([{ ts, actor: 'a', action: 'x' }, { ts: ts + 366 * DAY, actor: 'a', action: 'y' }])));
});
