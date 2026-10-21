import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecurityIllustration, buildSecurityWalkthrough } from '../src/security-diagrams.js';
import { newDoc } from '../src/state.js';
import { nodeRect, rectsIntersect, zoneMembers, NOTE_W, noteHeight } from '../src/geometry.js';
import { deserialize, serialize } from '../src/serialize.js';
import { PARTS } from '../src/palette.js';

// A minimal contract-shaped analysis. Sources are complete (partial false),
// evidence falls inside the retained lines, and every source-backed item
// carries evidence so validateSecurityAnalysis accepts the fixtures.
const hash = 'a'.repeat(64);
const source = (over = {}) => ({
  id: 'src-adv', name: 'Vendor advisory', url: 'https://example.com/advisory',
  retrievedAt: '2026-10-01T00:00:00Z', hash, text: 'alpha\nbeta\ngamma\ndelta',
  startLine: 1, totalLines: 4, partial: false, warnings: [], ...over,
});
const finding = (id, kind, view, over = {}) => ({
  id, kind, view, title: `Finding ${id}`, detail: `Detail for ${id}.`,
  basis: 'inference', evidence: [], targets: [], ...over,
});
const rel = (id, from, to, view, over = {}) => ({
  id, from, to, label: `rel ${id}`, basis: 'inference', view, evidence: [], ...over,
});
const analysis = (over = {}) => ({
  version: 1, id: 'an-1', title: 'Firmware update vulnerability', cveId: 'CVE-2026-1234',
  status: 'published', summary: 'Summary.', generatedAt: '2026-10-02T00:00:00Z',
  sources: [source()], findings: [], relationships: [], warnings: [], ...over,
});

const exploitSet = () => analysis({
  findings: [
    finding('f-pre', 'prerequisite', 'exploit'),
    finding('f-bug', 'root_cause', 'exploit', {
      basis: 'source', evidence: [{ sourceId: 'src-adv', startLine: 2, endLine: 3 }],
    }),
    finding('f-step', 'step', 'exploit'),
    finding('f-impact', 'impact', 'exploit'),
  ],
  relationships: [
    rel('r1', 'f-pre', 'f-bug', 'exploit'),
    rel('r2', 'f-bug', 'f-step', 'exploit', {
      basis: 'source', evidence: [{ sourceId: 'src-adv', startLine: 1, endLine: 2 }],
    }),
    rel('r3', 'f-step', 'f-impact', 'exploit'),
  ],
});

const userNode = (id, x = 100, y = 100) => ({
  id, kind: 'mcu', x, y, label: 'MCU', sublabel: '', color: null, addr: '', rail: '',
  notes: '', status: null, flags: [],
});
const nodeById = (doc, id) => doc.nodes.find((n) => n.id === id);
const zoneRect = (z) => ({ x: z.x, y: z.y, w: z.w, h: z.h });
const nodeMembersOf = (doc, zone) => zoneMembers(doc, zone)
  .filter((id) => doc.nodes.some((n) => n.id === id));
const rectInside = (r, z) => z.x <= r.x && r.x + r.w <= z.x + z.w && z.y <= r.y && r.y + r.h <= z.y + z.h;


test('exploit view renders editable cards and directed logical wires', () => {
  const doc = newDoc('Board');
  const res = buildSecurityIllustration(doc, exploitSet());
  assert.equal(res.doc, doc, 'the same document object comes back');
  assert.equal(res.targets.view, 'exploit');

  const nodes = res.targets.nodes.map((id) => nodeById(doc, id));
  assert.equal(nodes.length, 4);
  for (const n of nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${n.id} placed`);

  const bug = nodes[1];
  assert.deepEqual(bug.flags, ['bug']);
  assert.equal(bug.fields.cve, 'CVE-2026-1234');
  assert.match(bug.notes, /Evidence: Vendor advisory L2-L3/);

  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, 3);
  for (const w of wires) {
    assert.ok(['flow', 'link'].includes(w.bus), `wire ${w.id} must stay a logical bus, got ${w.bus}`);
    assert.equal(w.arrow, 'fwd');
    assert.match(w.label, /\[(source|inference)\]$/, 'wire labels show their basis');
  }
  assert.equal(wires[0].from.node, nodes[0].id);
  assert.equal(wires[0].to.node, nodes[1].id);
  assert.equal(wires[1].from.node, nodes[1].id);
  assert.equal(wires[1].to.node, nodes[2].id);
  assert.equal(wires[0].style, 'dashed', 'inferred relationships draw dashed');
  assert.equal(wires[1].style, null, 'source-backed relationships draw solid');
});

test('mixed asset findings draw real glyphs, adapted custom cards and logical wires end to end', () => {
  const doc = newDoc('Mixed assets');
  const evidence = [{ sourceId: 'src-adv', startLine: 1, endLine: 2 }];
  const base = analysis({
    findings: [
      finding('f-actor', 'step', 'exploit', { title: 'Remote attacker', assetKind: 'threatactor' }),
      finding('f-host', 'component', 'exploit', { title: 'Linux build host', assetKind: 'linux' }),
      finding('f-lib', 'affected', 'exploit', { title: 'Vulnerable library', assetKind: 'package',
        basis: 'source', evidence }),
      finding('f-fw', 'mitigation', 'exploit', { title: 'Edge firewall', assetKind: 'firewall' }),
      finding('f-bug', 'root_cause', 'exploit', { assetKind: 'kernel', basis: 'source', evidence }),
      finding('f-site', 'impact', 'exploit', { title: 'Office building', assetKind: 'building' }),
      finding('f-owner', 'impact', 'exploit', { title: 'Device owner', assetKind: 'person' }),
    ],
    relationships: [
      rel('m1', 'f-actor', 'f-host', 'exploit'),
      rel('m2', 'f-host', 'f-lib', 'exploit', { basis: 'source', evidence }),
      rel('m3', 'f-actor', 'f-host', 'exploit'),
      rel('m4', 'f-host', 'f-actor', 'exploit'),
      rel('m5', 'f-lib', 'f-bug', 'exploit'),
      rel('m6', 'f-fw', 'f-host', 'exploit'),
      rel('m7', 'f-site', 'f-owner', 'exploit'),
    ],
  });
  const res = buildSecurityIllustration(doc, base);
  const card = (fid) => nodeById(doc, res.targets.items[fid]);
  assert.equal(res.targets.nodes.length, 7, 'every asset finding framed a card');

  // Kinds whose four n/e/s/w ports are untyped become the real catalogue
  // node: the glyph, badge and fields are catalogue data.
  assert.equal(card('f-actor').kind, 'threatactor');
  assert.equal(card('f-lib').kind, 'package');
  assert.equal(card('f-bug').kind, 'kernel');
  assert.deepEqual(card('f-bug').flags, ['bug'], 'the root cause keeps its bug flag on a real asset');
  assert.equal(card('f-bug').fields, undefined, 'no CVE field is invented on an asset without one');
  assert.equal(card('f-actor').sublabel, 'Threat Actor · inferred');
  assert.equal(card('f-lib').sublabel, 'Software package · source-backed');

  // Every other asset adapts: a custom card borrowing the catalogue's
  // identity over four logical link ports — never a hardware pin, never an
  // arbitrary SVG path.
  for (const [fid, kind] of [['f-host', 'linux'], ['f-fw', 'firewall'], ['f-site', 'building'], ['f-owner', 'person']]) {
    const node = card(fid);
    assert.equal(node.kind, 'custom', `${fid} adapts to a custom asset card`);
    assert.deepEqual(node.part.icon, { kind }, `${fid} wears the ${kind} catalogue glyph`);
    assert.equal(node.part.name, PARTS[kind].name);
    assert.equal(node.part.category, PARTS[kind].category);
    assert.equal(node.part.accent, PARTS[kind].accent, `${fid} keeps the catalogue accent`);
    assert.deepEqual(node.part.ports.map((p) => `${p.id}:${p.bus}`).sort(),
      ['e:link', 'n:link', 's:link', 'w:link'], `${fid} exposes exactly the four logical link ports`);
    assert.match(node.sublabel, new RegExp(`^${PARTS[kind].name} · `), 'sublabel names the asset and its basis');
  }
  assert.match(card('f-lib').notes, /Evidence: Vendor advisory L1-L2/, 'citations ride the asset cards');

  // Relationships stay logical and directed; parallel and reversed edges on
  // one pair each keep their own lane.
  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, base.relationships.length, 'every stated relationship became a wire');
  for (const w of wires) {
    assert.ok(['flow', 'link'].includes(w.bus), 'relationships stay logical, never physical Ethernet');
    assert.equal(w.arrow, 'fwd');
  }
  const actorId = card('f-actor').id, hostId = card('f-host').id;
  const pair = wires.filter((w) => [w.from.node, w.to.node].every((n) => [actorId, hostId].includes(n)));
  assert.equal(pair.length, 3, 'parallel and reversed relationships all wire');
  assert.equal(new Set(pair.map((w) => [w.from.node, w.from.port, w.to.node, w.to.port].join('|'))).size, 3,
    'each occupies its own lane');
  assert.ok(pair.some((w) => w.from.node === actorId && w.to.node === hostId), 'forward direction kept');
  assert.ok(pair.some((w) => w.from.node === hostId && w.to.node === actorId), 'reversed direction kept');
  const m2 = wires.find((w) => w.label.startsWith('rel m2'));
  assert.equal(m2.from.node, hostId);
  assert.equal(m2.to.node, card('f-lib').id);
  assert.equal(m2.style, null, 'source-backed relationships draw solid');

  // Size-aware layout: no two cards overlap.
  const rects = doc.nodes.map(nodeRect);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    assert.equal(rectsIntersect(rects[i], rects[j]), false, 'mixed asset cards never overlap');
  }

  // Walkthrough stops survive, and a save/reopen keeps the borrowed glyphs,
  // the logical ports and the wiring.
  assert.equal(buildSecurityWalkthrough(doc, res.analysis).stops.length, 7);
  const round = deserialize(serialize(doc));
  const reopened = round.doc.nodes.find((n) => n.id === hostId);
  assert.deepEqual(reopened.part.icon, { kind: 'linux' }, 'the borrowed glyph survives the round trip');
  assert.deepEqual(reopened.part.ports.map((p) => p.id), ['n', 'e', 's', 'w']);
  assert.equal(round.doc.wires.find((w) => w.label.startsWith('rel m2')).bus, m2.bus);
  assert.equal(buildSecurityWalkthrough(round.doc, round.doc.securityAnalysis).stops.length, 7,
    'reopened asset cards still resolve as walkthrough stops');

  // Atomicity: a parallel burst past the lane budget is refused before
  // anything is drawn, on adapted custom cards too.
  const fresh = newDoc('Atomic');
  const hostile = analysis({
    findings: [
      finding('h1', 'component', 'exploit', { assetKind: 'firewall' }),
      finding('h2', 'component', 'exploit', { assetKind: 'linux' }),
    ],
    relationships: Array.from({ length: 17 }, (_, i) => rel(`px${i}`, 'h1', 'h2', 'exploit')),
  });
  const before = JSON.stringify(fresh);
  assert.throws(() => buildSecurityIllustration(fresh, hostile), /16 wire lanes one card pair can carry/);
  assert.equal(JSON.stringify(fresh), before, 'the board is left untouched');
});

test('unrelated board content and journey survive; the illustration lands clear of it', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  doc.journey.push({
    id: 'keepstep', label: 'User step', view: { cx: 100, cy: 100, zoom: 1 }, caption: 'mine',
    stops: [{ id: 'keepstop', node: 'keep1', caption: 'hello' }],
  });
  const res = buildSecurityIllustration(doc, exploitSet());

  const kept = nodeById(doc, 'keep1');
  assert.ok(kept, 'user node kept');
  assert.equal(kept.x, 100, 'user node never moves');
  assert.equal(kept.y, 100);
  const chapter = doc.journey.find((c) => c.id === 'keepstep');
  assert.ok(chapter, 'user chapter kept');
  assert.deepEqual(chapter.stops, [{ id: 'keepstop', node: 'keep1', caption: 'hello' }]);
  assert.equal(doc.journey.length, 2, 'one user chapter plus one generated chapter');

  const keptRect = nodeRect(kept);
  for (const id of res.targets.nodes) {
    const card = nodeById(doc, id);
    assert.ok(card.x > keptRect.x + keptRect.w, 'illustration starts in free space');
    assert.equal(rectsIntersect(nodeRect(card), keptRect), false, 'no generated card covers the user card');
  }
});

test('findings and the stored analysis point at the real generated ids', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-mit', 'mitigation', 'mitigation'));
  const res = buildSecurityIllustration(doc, base);

  const boardIds = new Set([...doc.nodes, ...doc.wires, ...doc.zones, ...doc.notes].map((i) => i.id));
  for (const f of res.analysis.findings) {
    if (f.view === 'exploit') {
      assert.equal(f.targets.length, 1, `${f.id} linked to its card`);
      assert.ok(boardIds.has(f.targets[0]), `${f.id} target exists on the board`);
      assert.equal(f.targets[0], res.targets.items[f.id]);
    } else {
      assert.deepEqual(f.targets, [], 'findings outside the view keep their own targets');
    }
  }
  assert.deepEqual(doc.securityAnalysis, res.analysis, 'doc stores the updated validated analysis');
});

test('only relationships stated for the view create wires', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.relationships.push(rel('r-mit', 'f-pre', 'f-impact', 'mitigation'));
  const res = buildSecurityIllustration(doc, base);
  assert.equal(res.targets.wires.length, 3, 'the mitigation relationship draws nothing in the exploit view');
});

test('relationship endpoints from other views are pulled into the illustration', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-comp', 'component', 'architecture'));
  base.relationships.push(rel('rx', 'f-step', 'f-comp', 'exploit'));
  const res = buildSecurityIllustration(doc, base);
  const compId = res.targets.items['f-comp'];
  assert.ok(compId && nodeById(doc, compId), 'the architecture-only finding is drawn in the exploit view');
  assert.equal(res.targets.nodes.length, 5);
  assert.equal(res.targets.wires.length, 4);
  assert.deepEqual(res.analysis.findings.find((f) => f.id === 'f-comp').targets, [compId]);
});

test('rebuilding appends a fresh illustration and accumulates targets; earlier work stays', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-comp', 'component', 'architecture'));
  const first = buildSecurityIllustration(doc, base, { view: 'exploit' });
  const arch = buildSecurityIllustration(doc, first.analysis, { view: 'architecture' });
  const second = buildSecurityIllustration(doc, first.analysis, { view: 'exploit' });

  assert.equal(second.targets.nodes.length, 4, 'a full fresh set of cards');
  for (const id of first.targets.nodes) assert.ok(nodeById(doc, id), 'the earlier exploit cards stay for Undo');
  assert.ok(nodeById(doc, arch.targets.nodes[0]), 'the architecture card stays too');
  assert.equal(doc.journey.filter((c) => c.label.startsWith('Security illustration (exploit):')).length, 2,
    'a chapter is appended per build');
  assert.equal(doc.journey.filter((c) => c.label.startsWith('Security illustration (architecture):')).length, 1);
  const bugFirst = first.analysis.findings.find((f) => f.id === 'f-bug').targets;
  const bugSecond = second.analysis.findings.find((f) => f.id === 'f-bug').targets;
  assert.deepEqual(bugSecond, [...bugFirst, second.targets.items['f-bug']], 'targets accumulate across builds');
  assert.equal(new Set(bugSecond).size, bugSecond.length, 'accumulated targets stay deduped');
  assert.deepEqual(second.analysis.illustrations.map((r) => r.view), ['exploit', 'exploit'],
    'records append in build order to the analysis each build was given');
  for (const record of second.analysis.illustrations) {
    for (const item of record.items) {
      assert.ok(second.analysis.findings.find((f) => f.id === item.findingId).targets.includes(item.target),
        'every record target is one of its finding’s board links');
    }
  }
});

test('a finding already at the 200-target limit rejects the build before drawing', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const targets = Array.from({ length: 200 }, (_, i) => `stale-${i}`);
  const base = analysis({ findings: [finding('f-full', 'step', 'exploit', { targets })] });
  const before = JSON.stringify(doc);
  assert.throws(() => buildSecurityIllustration(doc, base), /maximum of 200 board links/);
  assert.equal(JSON.stringify(doc), before, 'nothing is drawn and no evidence link is dropped');
});

test('a view without findings throws a useful error and leaves the board untouched', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const before = JSON.stringify(doc);
  assert.throws(
    () => buildSecurityIllustration(doc, exploitSet(), { view: 'mitigation' }),
    (err) => /No mitigation findings to illustrate/.test(err.message)
      && /architecture 0, exploit 4, mitigation 0/.test(err.message),
  );
  assert.equal(JSON.stringify(doc), before, 'nothing was drawn');
});

test('an invalid analysis is rejected before anything is drawn', () => {
  const doc = newDoc('Board');
  const bad = exploitSet();
  delete bad.sources;
  const before = JSON.stringify(doc);
  assert.throws(() => buildSecurityIllustration(doc, bad), /Security analysis/);
  assert.equal(JSON.stringify(doc), before);
});

test('an unknown view throws', () => {
  const doc = newDoc('Board');
  assert.throws(() => buildSecurityIllustration(doc, exploitSet(), { view: 'sideways' }), /Unknown illustration view "sideways"/);
});

test('only endpoints declared inside a boundary become zone members; metadata findings become notes', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-dmz', 'boundary', 'exploit'), finding('f-sev', 'severity', 'exploit'));
  base.relationships.push(
    rel('r4', 'f-dmz', 'f-step', 'exploit', { boundaryRelation: 'inside' }),
    rel('r5', 'f-impact', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
    rel('r6', 'f-bug', 'f-sev', 'exploit'),
  );
  const res = buildSecurityIllustration(doc, base);

  const zone = doc.zones.find((z) => z.id === res.targets.items['f-dmz']);
  assert.ok(zone, 'boundary became a zone');
  assert.equal(zone.color, '#f59e0b');
  assert.match(zone.label, /Finding f-dmz \[inference\]/);
  assert.match(zone.label, /— inferred membership$/, 'inference-backed containment says so in the label');
  for (const fid of ['f-step', 'f-impact']) {
    const r = nodeRect(nodeById(doc, res.targets.items[fid]));
    assert.ok(rectInside(r, zone), `${fid} sits inside the trust boundary`);
  }
  assert.ok(nodeById(doc, res.targets.boundaryCards['f-dmz']),
    'the boundary drew a card for its inside relationships to wire to');
  assert.equal(res.targets.wires.length, 5,
    'every stated relationship wires — the three flow steps plus both boundary relationships');
  for (const label of ['rel r4', 'rel r5']) {
    const w = res.targets.wires.map((id) => doc.wires.find((x) => x.id === id)).find((x) => x.label.startsWith(label));
    assert.ok(w, `${label} is drawn as a directed labelled wire as well as containment`);
  }

  const note = doc.notes.find((t) => t.id === res.targets.items['f-sev']);
  assert.ok(note, 'severity became a note');
  assert.match(note.text, /^severity: Finding f-sev \[inference\]/);
  assert.ok(res.targets.notes.includes(note.id));
});

test('a source-backed outside client never reads as inside the boundary: geometry, membership, both wires', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const evidence = [{ sourceId: 'src-adv', startLine: 1, endLine: 2 }];
  const base = analysis({
    findings: [
      finding('f-client', 'component', 'exploit'),
      finding('f-parser', 'component', 'exploit'),
      finding('f-dmz', 'boundary', 'exploit'),
    ],
    relationships: [
      rel('r-in', 'f-parser', 'f-dmz', 'exploit', {
        basis: 'source', evidence, boundaryRelation: 'inside',
      }),
      rel('r-out', 'f-dmz', 'f-client', 'exploit', {
        basis: 'source', evidence, boundaryRelation: 'outside',
      }),
    ],
  });
  const res = buildSecurityIllustration(doc, base);

  const zone = doc.zones.find((z) => z.id === res.targets.items['f-dmz']);
  assert.ok(zone, 'the boundary with a source-backed inside endpoint became a zone');
  assert.doesNotMatch(zone.label, /inferred membership/, 'source-backed containment needs no qualifier');
  const parser = nodeById(doc, res.targets.items['f-parser']);
  const client = nodeById(doc, res.targets.items['f-client']);
  const boundaryCard = nodeById(doc, res.targets.boundaryCards['f-dmz']);
  assert.ok(boundaryCard, 'the boundary drew a card so its relationships stay wires');

  // The app decides membership geometrically, so verify real geometry.
  assert.ok(rectInside(nodeRect(parser), zone), 'the declared-inside parser sits inside the zone');
  assert.equal(rectsIntersect(nodeRect(client), zoneRect(zone)), false,
    'the declared-outside client card lies fully outside the zone rectangle, not merely center-outside');
  assert.equal(rectsIntersect(nodeRect(boundaryCard), zoneRect(zone)), false,
    'the boundary card is not swallowed by its own zone');
  assert.deepEqual(nodeMembersOf(doc, zone), [parser.id], 'geometric membership is exactly the declared member');

  assert.equal(res.targets.wires.length, 2, 'both directions of the boundary story stay wires');
  const into = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id)).find((w) => w.label.startsWith('rel r-in'));
  const outOf = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id)).find((w) => w.label.startsWith('rel r-out'));
  assert.ok(into && outOf);
  assert.equal(into.from.node, parser.id, 'r-in direction: parser -> boundary');
  assert.equal(into.to.node, boundaryCard.id);
  assert.equal(outOf.from.node, boundaryCard.id, 'r-out direction: boundary -> client');
  assert.equal(outOf.to.node, client.id);
  for (const w of [into, outOf]) {
    assert.equal(w.arrow, 'fwd');
    assert.equal(w.style, null, 'source-backed relationships draw solid');
    assert.ok(['flow', 'link'].includes(w.bus));
  }

  const walk = buildSecurityWalkthrough(doc, res.analysis);
  assert.equal(walk.stops.length, 2, 'client and parser are stops; the boundary card is not');
  assert.deepEqual(walk.missing, []);
  assert.deepEqual(res.analysis.findings.find((f) => f.id === 'f-dmz').targets.sort(),
    [zone.id, boundaryCard.id].sort(), 'the boundary owns both its zone and its card');
});

test('an unknown-basis inside relationship asserts no containment', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-shard', 'component', 'exploit'),
      finding('f-dmz', 'boundary', 'exploit'),
    ],
    relationships: [
      rel('r-unknown', 'f-shard', 'f-dmz', 'exploit', { basis: 'unknown', boundaryRelation: 'inside' }),
    ],
  });
  const res = buildSecurityIllustration(doc, base);
  const plainZones = doc.zones.filter((z) => z.kind !== 'swimlane');
  assert.equal(plainZones.length, 0, 'unknown evidence never becomes asserted zone containment');
  const card = nodeById(doc, res.targets.items['f-dmz']);
  assert.ok(card, 'the boundary is a labelled card instead');
  assert.equal(res.targets.wires.length, 1, 'the uncertain membership stays a wire');
  const wire = doc.wires.find((w) => w.id === res.targets.wires[0]);
  assert.equal(wire.style, 'dotted', 'unknown basis draws dotted');
  assert.match(wire.label, /\[unknown\]$/);
});

test('contradictory inside and outside declarations suppress containment and keep both wires', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-keeper', 'component', 'exploit'),
      finding('f-ambig', 'component', 'exploit'),
      finding('f-dmz', 'boundary', 'exploit'),
    ],
    relationships: [
      rel('r-keep', 'f-keeper', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('r-amb-in', 'f-ambig', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('r-amb-out', 'f-dmz', 'f-ambig', 'exploit', { boundaryRelation: 'outside' }),
    ],
  });
  const res = buildSecurityIllustration(doc, base);

  const zone = doc.zones.find((z) => z.id === res.targets.items['f-dmz']);
  assert.ok(zone, 'the unambiguous member still gets its safe zone');
  assert.deepEqual(nodeMembersOf(doc, zone), [res.targets.items['f-keeper']],
    'the card declared both inside and outside is never contained');
  const ambig = nodeById(doc, res.targets.items['f-ambig']);
  assert.equal(rectsIntersect(nodeRect(ambig), zoneRect(zone)), false,
    'the contradictory card lies fully outside the zone');
  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, 3, 'both of the ambiguous card’s relationships stay wires');
  assert.ok(wires.some((w) => w.label.startsWith('rel r-amb-in')));
  assert.ok(wires.some((w) => w.label.startsWith('rel r-amb-out')));
  assert.ok(wires.some((w) => w.label.startsWith('rel r-keep')));
});


test('a card the layout would place inside the zone is moved clear of it', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const base = analysis({
    findings: [
      finding('f-m1', 'component', 'exploit'),
      finding('f-o', 'component', 'exploit'),
      finding('f-m2', 'component', 'exploit'),
      finding('f-dmz', 'boundary', 'exploit'),
    ],
    relationships: [
      rel('ri1', 'f-m1', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('ri2', 'f-m2', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('ro', 'f-dmz', 'f-o', 'exploit', { boundaryRelation: 'outside' }),
      rel('rx1', 'f-m1', 'f-o', 'exploit'),
      rel('rx2', 'f-o', 'f-m2', 'exploit'),
    ],
  });
  const res = buildSecurityIllustration(doc, base);

  const zone = doc.zones.find((z) => z.id === res.targets.items['f-dmz']);
  assert.ok(zone, 'the boundary zoned its declared members');
  for (const fid of ['f-m1', 'f-m2']) {
    assert.ok(rectInside(nodeRect(nodeById(doc, res.targets.items[fid])), zone), `${fid} sits inside`);
  }
  const outside = nodeById(doc, res.targets.items['f-o']);
  assert.equal(rectsIntersect(nodeRect(outside), zoneRect(zone)), false,
    'the declared-outside card ends up fully outside the fitted zone rectangle');
  assert.deepEqual(nodeMembersOf(doc, zone).sort(), [res.targets.items['f-m1'], res.targets.items['f-m2']].sort(),
    'geometric membership is exactly the declared members, nothing interleaved');
  for (const w of res.targets.wires.map((id) => doc.wires.find((x) => x.id === id))) {
    assert.ok(nodeById(doc, w.from.node) && nodeById(doc, w.to.node), 'relocation never strands a wire');
  }
});

test('crossing, none and unspecified boundary relationships draw wires and imply no membership', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-bus', 'component', 'architecture'),
      finding('f-legacy', 'component', 'architecture'),
      finding('f-perim', 'boundary', 'architecture'),
    ],
    relationships: [
      rel('r-cross', 'f-bus', 'f-perim', 'architecture', { boundaryRelation: 'crosses' }),
      rel('r-unspecified', 'f-legacy', 'f-perim', 'architecture'),
      rel('r-none', 'f-perim', 'f-bus', 'architecture', { boundaryRelation: 'none' }),
    ],
  });
  const res = buildSecurityIllustration(doc, base, { view: 'architecture' });

  assert.equal(doc.zones.filter((z) => z.kind !== 'swimlane').length, 0, 'nothing was declared inside, so no zone may imply containment');
  const card = nodeById(doc, res.targets.items['f-perim']);
  assert.ok(card, 'the boundary itself became a card its relationships can wire to');
  assert.equal(res.targets.nodes.includes(card.id), true, 'the boundary card is framed by the chapter');

  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, 3, 'crosses, unspecified and none all stay visible as wires');
  assert.ok(wires.some(w => w.from.node === res.targets.items['f-bus'] && w.to.node === card.id), 'crossing input reaches the boundary');
  assert.ok(wires.some(w => w.from.node === card.id && w.to.node === res.targets.items['f-bus']), 'the reverse relation retains its direction');
  assert.ok(wires.some(w => w.from.node === res.targets.items['f-legacy'] && w.to.node === card.id), 'unspecified membership retains its connection without containment');
  for (const w of wires) assert.equal(w.arrow, 'fwd');

  const walk = buildSecurityWalkthrough(doc, res.analysis, { view: 'architecture' });
  assert.equal(walk.stops.length, 2, 'the boundary card is not a walkthrough stop');
  assert.deepEqual(walk.missing, []);
});

test('one boundary can hold a safe zone and still wire outside relations in both directions', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-in', 'component', 'exploit'),
      finding('f-out1', 'component', 'exploit'),
      finding('f-out2', 'component', 'exploit'),
      finding('f-dmz', 'boundary', 'exploit'),
    ],
    relationships: [
      rel('ri', 'f-in', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('ro1', 'f-out1', 'f-dmz', 'exploit', { boundaryRelation: 'outside' }),
      rel('ro2', 'f-dmz', 'f-out2', 'exploit', { boundaryRelation: 'outside' }),
    ],
  });
  const res = buildSecurityIllustration(doc, base);

  const zone = doc.zones.find((z) => z.id === res.targets.items['f-dmz']);
  assert.ok(zone, 'zone and card together are possible');
  const boundaryCard = nodeById(doc, res.targets.boundaryCards['f-dmz']);
  assert.ok(boundaryCard);
  assert.ok(rectInside(nodeRect(nodeById(doc, res.targets.items['f-in'])), zone));
  assert.deepEqual(nodeMembersOf(doc, zone), [res.targets.items['f-in']]);
  for (const fid of ['f-out1', 'f-out2']) {
    assert.equal(rectsIntersect(nodeRect(nodeById(doc, res.targets.items[fid])), zoneRect(zone)), false,
      `${fid} stays fully outside the zone`);
  }
  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, 3, 'the inside relationship wires as well as contains; both outside relationships wired');
  const keep = wires.find((w) => w.label.startsWith('rel ri'));
  const into = wires.find((w) => w.label.startsWith('rel ro1'));
  const outOf = wires.find((w) => w.label.startsWith('rel ro2'));
  assert.ok(keep && into && outOf);
  assert.equal(keep.from.node, res.targets.items['f-in'], 'inside wire: endpoint -> boundary card');
  assert.equal(keep.to.node, boundaryCard.id);
  assert.equal(into.from.node, res.targets.items['f-out1'], 'endpoint -> boundary direction kept');
  assert.equal(into.to.node, boundaryCard.id);
  assert.equal(outOf.from.node, boundaryCard.id, 'boundary -> endpoint direction kept');
  assert.equal(outOf.to.node, res.targets.items['f-out2']);
});

test('a boundary that would gain a zone and a card past the 200-link cap is refused up front', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const targets = Array.from({ length: 199 }, (_, i) => `stale-${i}`);
  const base = analysis({
    findings: [
      finding('f-dmz', 'boundary', 'exploit', { targets }),
      finding('f-in', 'component', 'exploit'),
      finding('f-out', 'component', 'exploit'),
    ],
    relationships: [
      rel('ri', 'f-in', 'f-dmz', 'exploit', { boundaryRelation: 'inside' }),
      rel('ro', 'f-dmz', 'f-out', 'exploit', { boundaryRelation: 'outside' }),
    ],
  });
  const before = JSON.stringify(doc);
  assert.throws(() => buildSecurityIllustration(doc, base), /maximum of 200 board links/);
  assert.equal(JSON.stringify(doc), before, 'the two new links are refused together, never one dropped');
});

test('parallel and reversed relationships each get their own wire lane', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [finding('a1', 'component', 'architecture'), finding('a2', 'affected', 'architecture')],
    relationships: [
      rel('p1', 'a1', 'a2', 'architecture'),
      rel('p2', 'a1', 'a2', 'architecture'),
      rel('p3', 'a2', 'a1', 'architecture'),
    ],
  });
  const res = buildSecurityIllustration(doc, base, { view: 'architecture' });
  assert.equal(res.targets.wires.length, 3, 'no duplicate-endpoint rejection');
  const lanes = new Set(res.targets.wires.map((id) => {
    const w = doc.wires.find((x) => x.id === id);
    return [w.from.node, w.from.port, w.to.node, w.to.port].join('|');
  }));
  assert.equal(lanes.size, 3, 'every wire occupies a distinct port lane');
});

test('more than sixteen parallel relationships are rejected before anything is drawn', () => {
  const doc = newDoc('Board');
  doc.nodes.push(userNode('keep1'));
  const rels = [];
  for (let i = 0; i < 17; i++) rels.push(rel(`p${i}`, 'a', 'b', 'exploit'));
  const base = analysis({
    findings: [finding('a', 'step', 'exploit'), finding('b', 'step', 'exploit')],
    relationships: rels,
  });
  const before = JSON.stringify(doc);
  assert.throws(() => buildSecurityIllustration(doc, base), /exceed the 16 wire lanes one card pair can carry/);
  assert.equal(JSON.stringify(doc), before, 'the throw happens before any mutation');
});

test('finding ids are treated as opaque strings', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [finding('__proto__', 'step', 'exploit'), finding('constructor', 'step', 'exploit')],
    relationships: [rel('rproto', '__proto__', 'constructor', 'exploit')],
  });
  const res = buildSecurityIllustration(doc, base);
  const protoCard = nodeById(doc, res.targets.items['__proto__']);
  assert.ok(protoCard, 'no prototype shadowing on the id map');
  assert.equal(Object.prototype.hasOwnProperty.call(res.targets.items, '__proto__'), true);
  assert.equal(res.targets.items['constructor'], res.targets.items['constructor'] && nodeById(doc, res.targets.items['constructor']).id,
    'a finding literally named constructor maps to its card, not Object.prototype.constructor');
  assert.equal('toString' in res.targets.items, false, 'inherited keys do not leak');
  assert.deepEqual(res.analysis.findings.find((f) => f.id === '__proto__').targets, [protoCard.id]);
  assert.equal(buildSecurityWalkthrough(doc, res.analysis).stops.length, 2);
});

test('hostile boundary finding ids stay opaque through zones, cards and records', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('__proto__', 'boundary', 'exploit'),
      finding('constructor', 'component', 'exploit'),
      finding('hasOwnProperty', 'component', 'exploit'),
    ],
    relationships: [
      rel('ri', 'constructor', '__proto__', 'exploit', { boundaryRelation: 'inside' }),
      rel('ro', '__proto__', 'hasOwnProperty', 'exploit', { boundaryRelation: 'outside' }),
    ],
  });
  const res = buildSecurityIllustration(doc, base);
  assert.equal(Object.prototype.hasOwnProperty.call(res.targets.items, '__proto__'), true);
  const zone = doc.zones.find((z) => z.id === res.targets.items['__proto__']);
  const card = nodeById(doc, res.targets.boundaryCards['__proto__']);
  assert.ok(zone && card, 'zone and boundary card both generated');
  assert.deepEqual(nodeMembersOf(doc, zone), [res.targets.items['constructor']]);
  assert.equal(rectsIntersect(nodeRect(nodeById(doc, res.targets.items['hasOwnProperty'])), zoneRect(zone)), false,
    'the outside endpoint stays out of the zone');
  const record = res.analysis.illustrations.at(-1);
  assert.deepEqual(record.items.map((i) => i.findingId).sort(),
    ['__proto__', '__proto__', 'constructor', 'hasOwnProperty']);
  const walk = buildSecurityWalkthrough(doc, res.analysis);
  assert.equal(walk.stops.length, 2, 'the component cards are the only stops');
  assert.deepEqual(walk.missing, []);
});

test('consistency findings are metadata notes, never exploit flow', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-cons', 'consistency', 'exploit'));
  base.relationships.push(rel('rc', 'f-bug', 'f-cons', 'exploit'));
  const res = buildSecurityIllustration(doc, base);
  const note = doc.notes.find((t) => t.id === res.targets.items['f-cons']);
  assert.ok(note, 'consistency became a note');
  assert.match(note.text, /^consistency: Finding f-cons \[inference\]/);
  assert.equal(res.targets.nodes.length, 4, 'no card and no extra stop');
  assert.equal(buildSecurityWalkthrough(doc, res.analysis).stops.length, 4);
});

test('the walkthrough reads actual board targets and reports stale ones', () => {
  const doc = newDoc('Board');
  const base = exploitSet();
  base.findings.push(finding('f-sev', 'severity', 'exploit'));
  const built = buildSecurityIllustration(doc, base);

  const walk = buildSecurityWalkthrough(doc, built.analysis);
  assert.equal(walk.view, 'exploit');
  assert.equal(walk.chapter, built.targets.chapter);
  assert.equal(walk.stops.length, 4, 'cards only: the severity note is not a stop');
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  for (const stop of walk.stops) {
    assert.ok(nodeIds.has(stop.node), 'every stop points at a real node');
    assert.match(stop.caption, / \[(source|inference)\]/);
  }
  assert.equal(walk.stops[1].evidence[0].name, 'Vendor advisory');
  assert.equal(walk.stops[1].evidence[0].startLine, 2);
  assert.equal(walk.stops[1].evidence[0].endLine, 3);

  // A stale target is reported, never silently re-pointed or faked.
  const stepNode = built.targets.items['f-step'];
  doc.nodes = doc.nodes.filter((n) => n.id !== stepNode);
  const staleWalk = buildSecurityWalkthrough(doc, built.analysis);
  assert.ok(staleWalk.missing.some((m) => m.findingId === 'f-step'), 'deleted card reported missing');
  assert.ok(staleWalk.stops.every((s) => s.node !== stepNode));
});

test('architecture then exploit: the exploit walkthrough uses the exploit parser card only', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-parser', 'component', 'architecture'),
      finding('f-s1', 'step', 'exploit'),
      finding('f-s2', 'step', 'exploit'),
    ],
    relationships: [rel('ra', 'f-parser', 'f-s1', 'exploit')],
  });
  const arch = buildSecurityIllustration(doc, base, { view: 'architecture' });
  const exp = buildSecurityIllustration(doc, arch.analysis, { view: 'exploit' });

  const walk = buildSecurityWalkthrough(doc, exp.analysis, { view: 'exploit' });
  const parserStop = walk.stops.find((s) => s.findingId === 'f-parser');
  assert.ok(parserStop, 'the endpoint finding from the other view is walked');
  assert.equal(parserStop.node, exp.targets.items['f-parser'], 'the exploit illustration’s own parser card');
  assert.notEqual(parserStop.node, arch.targets.items['f-parser'], 'never the architecture card');
  assert.equal(walk.chapter, exp.targets.chapter, 'the newest matching chapter frames the walk');

  // Deleting the exploit illustration's parser card reports it missing even
  // though the architecture card for the same finding still exists.
  doc.nodes = doc.nodes.filter((n) => n.id !== exp.targets.items['f-parser']);
  const stale = buildSecurityWalkthrough(doc, exp.analysis, { view: 'exploit' });
  assert.ok(stale.missing.some((m) => m.findingId === 'f-parser'), 'no fallback to the other view’s card');
  assert.ok(stale.stops.every((s) => s.node !== arch.targets.items['f-parser']));
});

test('rebuilding a view supersedes the earlier illustration for walkthroughs', () => {
  const doc = newDoc('Board');
  const first = buildSecurityIllustration(doc, exploitSet());
  const second = buildSecurityIllustration(doc, first.analysis);

  const walk = buildSecurityWalkthrough(doc, second.analysis);
  const secondNodes = new Set(second.targets.nodes);
  for (const stop of walk.stops) assert.ok(secondNodes.has(stop.node), 'stops come from the newest build');
  assert.equal(walk.chapter, second.targets.chapter, 'the newest chapter frames the walk');

  const bugId = second.targets.items['f-bug'];
  doc.nodes = doc.nodes.filter((n) => n.id !== bugId);
  const stale = buildSecurityWalkthrough(doc, second.analysis);
  assert.ok(stale.missing.some((m) => m.findingId === 'f-bug'), 'the deleted newest card is missing');
  assert.ok(stale.stops.every((s) => s.node !== first.targets.items['f-bug']),
    'the first build’s surviving card does not stand in for it');
});

test('illustration records survive walkthrough:false and a save/import round trip', () => {
  const doc = newDoc('Board');
  const built = buildSecurityIllustration(doc, exploitSet(), { walkthrough: false });
  assert.equal(doc.journey.length, 0, 'no chapter was requested');
  assert.equal(built.analysis.illustrations.at(-1).chapter, '', 'the record notes the missing chapter');
  const direct = buildSecurityWalkthrough(doc, built.analysis);
  assert.equal(direct.view, 'exploit');
  assert.equal(direct.chapter, null);
  assert.equal(direct.stops.length, 4, 'the newest build is resolved without a chapter');

  const round = deserialize(serialize(doc));
  const again = buildSecurityWalkthrough(round.doc, round.doc.securityAnalysis);
  assert.equal(again.view, 'exploit');
  assert.equal(again.stops.length, 4, 'records reload with the analysis and still resolve the view');
  assert.deepEqual(again.missing, []);
});

test('legacy analyses without records fall back to the newest matching chapter', () => {
  const doc = newDoc('Board');
  const first = buildSecurityIllustration(doc, exploitSet());
  const second = buildSecurityIllustration(doc, first.analysis);
  const legacy = { ...second.analysis };
  delete legacy.illustrations;

  const walk = buildSecurityWalkthrough(doc, legacy, { view: 'exploit' });
  const newest = doc.journey.filter((c) => c.label.startsWith('Security illustration (exploit):')).at(-1);
  const newestNodes = new Set(newest.targets.nodes);
  assert.equal(walk.chapter, newest.id, 'legacy resolution uses the newest labelled chapter');
  for (const stop of walk.stops) assert.ok(newestNodes.has(stop.node));

  const bugId = second.targets.items['f-bug'];
  doc.nodes = doc.nodes.filter((n) => n.id !== bugId);
  const stale = buildSecurityWalkthrough(doc, legacy, { view: 'exploit' });
  assert.ok(stale.missing.some((m) => m.findingId === 'f-bug'),
    'the deleted newest card is missing; the older build’s card does not stand in');
});

test('without a record or a chapter nothing is guessed from accumulated targets', () => {
  const doc = newDoc('Board');
  const base = analysis({ findings: [finding('f-parser', 'component', 'architecture')] });
  const built = buildSecurityIllustration(doc, base, { view: 'architecture', walkthrough: false });
  assert.ok(nodeById(doc, built.targets.items['f-parser']), 'a live card exists');
  const legacy = { ...built.analysis };
  delete legacy.illustrations;

  const walk = buildSecurityWalkthrough(doc, legacy, { view: 'architecture' });
  assert.deepEqual(walk.stops, [], 'no stop is invented from links with no view provenance');
  assert.deepEqual(walk.missing, [{ findingId: 'f-parser', title: 'Finding f-parser' }]);
  assert.match(walk.empty, /No architecture illustration is associated with this analysis/);
  assert.match(walk.empty, /build the architecture illustration again/);
});


test('architecture view draws unnumbered cards and link associations', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('f-svc', 'component', 'architecture'),
      finding('f-db', 'affected', 'architecture'),
      finding('f-gap', 'root_cause', 'architecture'),
    ],
    relationships: [
      rel('ra1', 'f-svc', 'f-db', 'architecture'),
      rel('ra2', 'f-gap', 'f-svc', 'architecture'),
    ],
  });
  const res = buildSecurityIllustration(doc, base, { view: 'architecture' });
  const wires = res.targets.wires.map((id) => doc.wires.find((w) => w.id === id));
  assert.equal(wires.length, 2);
  for (const w of wires) {
    assert.equal(w.bus, 'link', 'architecture associations use the link bus');
    assert.equal(w.arrow, 'fwd', 'relationships are directional in every view');
  }
  const chapter = doc.journey.find((c) => c.id === res.targets.chapter);
  assert.ok(chapter.stops.every((s) => !/^\d+\./.test(s.caption)), 'architecture stops are not numbered');
});

test('mitigation view numbers its controls', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [finding('m1', 'mitigation', 'mitigation'), finding('m2', 'mitigation', 'mitigation')],
    relationships: [rel('rm', 'm1', 'm2', 'mitigation')],
  });
  const res = buildSecurityIllustration(doc, base, { view: 'mitigation' });
  assert.deepEqual(res.targets.nodes.map((id) => nodeById(doc, id).label), ['1. Finding m1', '2. Finding m2']);
  assert.equal(doc.wires.find((w) => w.id === res.targets.wires[0]).arrow, 'fwd');
});

test('walkthrough=false updates targets without adding a chapter', () => {
  const doc = newDoc('Board');
  const res = buildSecurityIllustration(doc, exploitSet(), { walkthrough: false });
  assert.equal(res.targets.chapter, null);
  assert.equal(doc.journey.length, 0);
  assert.equal(res.analysis.findings[0].targets.length, 1, 'targets still updated');
});

test('the default walkthrough view follows the newest illustration, not the finding counts', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [finding('a1', 'component', 'architecture'), finding('m1', 'mitigation', 'mitigation')],
  });
  const arch = buildSecurityIllustration(doc, base, { view: 'architecture' });
  assert.equal(buildSecurityWalkthrough(doc, arch.analysis).view, 'architecture');
  const mit = buildSecurityIllustration(doc, arch.analysis, { view: 'mitigation' });
  assert.equal(buildSecurityWalkthrough(doc, mit.analysis).view, 'mitigation', 'the newest record wins');
  const legacy = { ...mit.analysis };
  delete legacy.illustrations;
  assert.equal(buildSecurityWalkthrough(doc, legacy).view, 'mitigation', 'the newest labelled chapter wins without records');
});

test('analyses larger than one edit batch still apply completely', () => {
  const findings = [];
  const relationships = [];
  for (let i = 0; i < 60; i++) findings.push(finding(`f-${i}`, 'step', 'exploit'));
  for (let i = 0; i < 145; i++) {
    const from = `f-${i % 60}`;
    const to = `f-${(i * 7 + 1) % 60}`;
    if (from !== to) relationships.push(rel(`r-${i}`, from, to, 'exploit'));
  }
  const doc = newDoc('Board');
  const res = buildSecurityIllustration(doc, analysis({ findings, relationships }));
  assert.equal(res.targets.nodes.length, 60);
  assert.equal(res.targets.wires.length, relationships.length, 'every relationship became a wire');
  const chapter = doc.journey.find((c) => c.id === res.targets.chapter);
  assert.equal(chapter.stops.length, 60);
  for (const id of res.targets.wires) {
    const w = doc.wires.find((x) => x.id === id);
    assert.ok(['flow', 'link'].includes(w.bus));
  }
});

test('buildSecurityWalkthrough picks a view with findings and flags empty analyses', () => {
  const doc = newDoc('Board');
  const base = analysis({ findings: [finding('m1', 'mitigation', 'mitigation')] });
  const walk = buildSecurityWalkthrough(doc, base);
  assert.equal(walk.view, 'mitigation');
  assert.deepEqual(walk.stops, []);
  assert.equal(walk.missing.length, 1, 'not yet illustrated: reported instead of invented');
  assert.match(walk.empty, /No mitigation illustration is associated with this analysis/,
    'no record and no chapter: say so instead of guessing');

  const bare = buildSecurityWalkthrough(doc, analysis());
  assert.equal(bare.view, 'exploit');
  assert.match(bare.empty, /No exploit findings to illustrate/);
  assert.throws(() => buildSecurityWalkthrough(doc, analysis(), { view: 'sideways' }), /Unknown walkthrough view/);
});

test('chapterless and deleted latest chapters never borrow an older frame', () => {
  const doc = newDoc('Board');
  const first = buildSecurityIllustration(doc, exploitSet());
  const chapterless = buildSecurityIllustration(doc, first.analysis, { walkthrough: false });
  const walk = buildSecurityWalkthrough(doc, chapterless.analysis);
  assert.equal(walk.chapter, null);
  assert.deepEqual(new Set(walk.stops.map(stop => stop.node)), new Set(chapterless.targets.nodes));
  const newest = buildSecurityIllustration(doc, chapterless.analysis);
  doc.journey = doc.journey.filter(chapter => chapter.id !== newest.targets.chapter);
  const removedChapter = buildSecurityWalkthrough(doc, newest.analysis);
  assert.equal(removedChapter.chapter, null);
  assert.deepEqual(new Set(removedChapter.stops.map(stop => stop.node)), new Set(newest.targets.nodes));
});

test('shared membership without a domain hierarchy stays explicit without false zones', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [finding('shared', 'component', 'architecture'), finding('domain-a', 'boundary', 'architecture'), finding('domain-b', 'boundary', 'architecture')],
    relationships: [rel('inside-a', 'shared', 'domain-a', 'architecture', { boundaryRelation: 'inside' }),
      rel('inside-b', 'shared', 'domain-b', 'architecture', { boundaryRelation: 'inside' })],
  });
  const result = buildSecurityIllustration(doc, base, { view: 'architecture' });
  assert.equal(doc.zones.filter((z) => z.kind !== 'swimlane').length, 0, 'overlap versus nesting is not established by shared membership');
  for (const domain of ['domain-a', 'domain-b']) {
    assert.ok(doc.wires.some(wire => wire.from.node === result.targets.items.shared && wire.to.node === result.targets.items[domain] && wire.arrow === 'fwd'));
  }
});

test('generated captions stay clear of trust-zone contents and headers', () => {
  const doc = newDoc('Board');
  const result = buildSecurityIllustration(doc, analysis({
    findings: [finding('client', 'component', 'architecture'), finding('parser', 'component', 'architecture'), finding('domain', 'boundary', 'architecture')],
    relationships: [rel('outside', 'client', 'domain', 'architecture', { boundaryRelation: 'outside' }),
      rel('inside', 'domain', 'parser', 'architecture', { boundaryRelation: 'inside' })],
  }), { view: 'architecture' });
  const zone = doc.zones.find(item => result.targets.zones.includes(item.id));
  const caption = doc.notes.find(item => result.targets.notes.includes(item.id));
  assert.equal(rectsIntersect({ x: caption.x, y: caption.y, w: NOTE_W, h: noteHeight(caption.text) }, zoneRect(zone)), false);
  assert.ok(rectInside(nodeRect(nodeById(doc, result.targets.items.parser)), zone));
});

test('directed exploit layout and walkthrough follow evidence relationships, not finding array order', () => {
  const doc = newDoc('Directed view');
  const base = analysis({
    findings: [
      finding('impact', 'impact', 'exploit'),
      finding('mechanism', 'root_cause', 'exploit'),
      finding('local', 'prerequisite', 'exploit'),
      finding('configuration', 'prerequisite', 'exploit'),
      finding('trigger', 'step', 'exploit'),
    ],
    relationships: [
      rel('local-entry', 'local', 'trigger', 'exploit'),
      rel('config-entry', 'configuration', 'trigger', 'exploit'),
      rel('entry-mechanism', 'trigger', 'mechanism', 'exploit'),
      rel('mechanism-impact', 'mechanism', 'impact', 'exploit'),
    ],
  });
  const result = buildSecurityIllustration(doc, base);
  const rect = findingId => nodeRect(nodeById(doc, result.targets.items[findingId]));
  assert.equal(rect('local').y, rect('configuration').y, 'independent prerequisites share a layer');
  assert.ok(rect('local').y + rect('local').h < rect('trigger').y);
  assert.ok(rect('configuration').y + rect('configuration').h < rect('trigger').y);
  assert.ok(rect('trigger').y + rect('trigger').h < rect('mechanism').y);
  assert.ok(rect('mechanism').y + rect('mechanism').h < rect('impact').y);
  const walk = buildSecurityWalkthrough(doc, result.analysis);
  assert.deepEqual(walk.stops.map(stop => stop.findingId),
    ['local', 'configuration', 'trigger', 'mechanism', 'impact']);
  const chapter = doc.journey.find(item => item.id === result.targets.chapter);
  assert.deepEqual(chapter.stops.map(stop => stop.node), walk.stops.map(stop => stop.node));
  for (const relationship of base.relationships) {
    const wire = doc.wires.find(item => item.from.node === result.targets.items[relationship.from]
      && item.to.node === result.targets.items[relationship.to]);
    assert.ok(wire, 'the original direction is retained');
    assert.equal(wire.from.port, 's');
    assert.equal(wire.to.port, 'n');
  }
});

test('cyclic relationships remain visible without overlap or loss of the downstream stage', () => {
  const doc = newDoc('Cyclic view');
  const base = analysis({
    findings: [finding('outcome', 'impact', 'exploit'), finding('a', 'step', 'exploit'), finding('b', 'step', 'exploit')],
    relationships: [rel('ab', 'a', 'b', 'exploit'), rel('ba', 'b', 'a', 'exploit'), rel('bo', 'b', 'outcome', 'exploit')],
  });
  const result = buildSecurityIllustration(doc, base);
  const a = nodeRect(nodeById(doc, result.targets.items.a));
  const b = nodeRect(nodeById(doc, result.targets.items.b));
  const outcome = nodeRect(nodeById(doc, result.targets.items.outcome));
  assert.equal(a.y, b.y, 'a cycle is one layer, not an invented directed sequence');
  assert.equal(rectsIntersect(a, b), false);
  assert.ok(outcome.y > Math.max(a.y + a.h, b.y + b.h));
  assert.equal(result.targets.wires.length, 3);
  const reopened = deserialize(serialize(doc));
  assert.equal(buildSecurityWalkthrough(reopened.doc, reopened.doc.securityAnalysis).stops.length, 3);
});

test('long CVE findings and metadata stay clear of existing and newly generated cards', () => {
  const doc = newDoc('CVE layout');
  doc.nodes.push(userNode('existing', 80, 120));
  const original = structuredClone(doc.nodes[0]);
  const base = analysis({
    findings: [
      finding('cause', 'root_cause', 'exploit', { title: 'In-place AEAD operation with source and destination from different mappings' }),
      finding('access', 'prerequisite', 'exploit', { title: 'Low-privileged local attacker; no root or CAP_SYS_ADMIN needed' }),
      finding('config', 'prerequisite', 'exploit', { title: 'Kernel must be built with CRYPTO_USER_API_AEAD' }),
      finding('request', 'step', 'exploit', { title: 'Documented attack surface: drive AF_ALG AEAD requests through socket system calls' }),
      finding('impact', 'impact', 'exploit', { title: 'Source-reported consequences must remain distinguished from independently verified exploitation' }),
    ],
    relationships: [
      rel('access-request', 'access', 'request', 'exploit'),
      rel('config-request', 'config', 'request', 'exploit'),
      rel('request-cause', 'request', 'cause', 'exploit'),
      rel('cause-impact', 'cause', 'impact', 'exploit'),
    ],
  });
  const result = buildSecurityIllustration(doc, base);
  assert.deepEqual(doc.nodes.find(node => node.id === 'existing'), original);
  const boxes = doc.nodes.map(nodeRect);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    assert.equal(rectsIntersect(boxes[i], boxes[j]), false, 'card bodies do not overlap');
  }
  for (const id of result.targets.notes) {
    const note = doc.notes.find(item => item.id === id);
    const box = { x: note.x, y: note.y, w: NOTE_W, h: noteHeight(note.text) };
    assert.ok(boxes.every(card => !rectsIntersect(card, box)), 'metadata is outside the flow');
  }
});

test('interleaved members of separate trust domains retain every declared membership', () => {
  const doc = newDoc('Two domains');
  const base = analysis({
    findings: [
      finding('a1', 'component', 'architecture'), finding('b1', 'component', 'architecture'),
      finding('a2', 'component', 'architecture'), finding('b2', 'component', 'architecture'),
      finding('domain-a', 'boundary', 'architecture'), finding('domain-b', 'boundary', 'architecture'),
    ],
    relationships: [
      rel('aa1', 'domain-a', 'a1', 'architecture', { boundaryRelation: 'inside' }),
      rel('aa2', 'domain-a', 'a2', 'architecture', { boundaryRelation: 'inside' }),
      rel('bb1', 'domain-b', 'b1', 'architecture', { boundaryRelation: 'inside' }),
      rel('bb2', 'domain-b', 'b2', 'architecture', { boundaryRelation: 'inside' }),
    ],
  });
  const result = buildSecurityIllustration(doc, base, { view: 'architecture' });
  for (const [domain, members] of [['domain-a', ['a1', 'a2']], ['domain-b', ['b1', 'b2']]]) {
    const zone = doc.zones.find(item => item.id === result.targets.items[domain]);
    assert.deepEqual(new Set(nodeMembersOf(doc, zone)), new Set(members.map(id => result.targets.items[id])));
  }
  assert.equal(rectsIntersect(doc.zones[0], doc.zones[1]), false);
});

test('metadata relationships remain represented without inventing executable stages or wires', () => {
  const doc = newDoc('Metadata relationships');
  const base = analysis({
    findings: [
      finding('cause', 'root_cause', 'exploit'), finding('severity', 'severity', 'none'),
      finding('consistency', 'consistency', 'none'), finding('boundary', 'boundary', 'architecture'),
    ],
    relationships: [
      rel('cs', 'cause', 'severity', 'exploit', { label: 'severity assessment applies to this mechanism' }),
      rel('sc', 'severity', 'consistency', 'exploit', { label: 'assessment must be reconciled with supplied evidence' }),
      rel('bs', 'boundary', 'severity', 'exploit', { label: 'scope qualifies this assessment', basis: 'source',
        evidence: [{ sourceId: 'src-adv', startLine: 1, endLine: 2 }] }),
    ],
  });
  const result = buildSecurityIllustration(doc, base);
  assert.equal(result.targets.nodes.length, 1, 'metadata is not promoted to an attack stage');
  assert.equal(result.targets.wires.length, 0, 'no fictitious port endpoints are created');
  const annotations = result.targets.notes.map(id => doc.notes.find(note => note.id === id).text);
  for (const relation of base.relationships) {
    const from = base.findings.find(item => item.id === relation.from);
    const to = base.findings.find(item => item.id === relation.to);
    assert.ok(annotations.some(text => text.includes(`${from.title} → ${to.title}`)
      && text.includes(relation.label) && text.includes(`[${relation.basis}]`)), 'each non-wire relation remains legible');
  }
  assert.ok(annotations.some(text => text.includes('Vendor advisory L1-L2')), 'relationship evidence remains attached');
});

test('oversized metadata annotations are rejected atomically rather than losing later relationships', () => {
  const doc = newDoc('Preserved board');
  doc.nodes.push(userNode('keep', 80, 120));
  const before = structuredClone(doc);
  const components = Array.from({ length: 30 }, (_, index) => finding(`c${index}`, 'component', 'exploit', {
    title: `Component ${index} `.padEnd(240, 'x'),
  }));
  const base = analysis({
    findings: [...components, finding('severity', 'severity', 'none', { title: 'Severity '.padEnd(240, 's') })],
    relationships: components.map((component, index) => rel(`r${index}`, component.id, 'severity', 'exploit', {
      label: `Relationship ${index} `.padEnd(240, 'r'),
    })),
  });
  assert.throws(() => buildSecurityIllustration(doc, base), Error);
  assert.deepEqual(doc, before);
});

test('views without trust zones arrange cards into labelled, color-coded scene bands', () => {
  const doc = newDoc('Board');
  const base = analysis({
    findings: [
      finding('actor', 'component', 'architecture', { assetKind: 'threatactor' }),
      finding('engineer', 'component', 'architecture', { assetKind: 'person' }),
      finding('firewall', 'component', 'architecture', { assetKind: 'waf' }),
      finding('host', 'affected', 'architecture', { assetKind: 'linux' }),
      finding('library', 'affected', 'architecture', { assetKind: 'package' }),
      finding('site', 'component', 'architecture', { assetKind: 'building' }),
    ],
    relationships: [
      rel('r1', 'actor', 'firewall', 'architecture'),
      rel('r2', 'firewall', 'host', 'architecture'),
      rel('r3', 'host', 'library', 'architecture'),
      rel('r4', 'engineer', 'host', 'architecture'),
      rel('r5', 'host', 'site', 'architecture'),
    ],
  });
  const res = buildSecurityIllustration(doc, base, { view: 'architecture' });
  const bands = doc.zones.filter((z) => z.kind === 'swimlane');
  assert.ok(bands.length >= 4, `expected scene bands, got ${JSON.stringify(doc.zones.map((z) => z.label))}`);
  assert.equal(doc.zones.length, bands.length, 'no plain zones: no containment was declared');
  const bandOf = (node) => {
    const r = nodeRect(node);
    return bands.find((z) => z.x <= r.x && z.y <= r.y && r.x + r.w <= z.x + z.w && r.y + r.h <= z.y + z.h);
  };
  for (const f of base.findings) assert.ok(bandOf(nodeById(doc, res.targets.items[f.id])), `${f.id} sits inside its scene band`);
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      assert.equal(rectsIntersect(zoneRect(bands[i]), zoneRect(bands[j])), false, 'scene bands never overlap');
    }
  }
  const labelOf = (id) => bandOf(nodeById(doc, res.targets.items[id])).label;
  assert.equal(labelOf('actor'), labelOf('engineer'), 'threat actors and people share a scene');
  assert.equal(labelOf('host'), labelOf('library'), 'operating systems and software share a scene');
  assert.notEqual(labelOf('actor'), labelOf('host'), 'actors and systems stay in distinct scenes');
  assert.equal(labelOf('site'), 'Facilities');
  const reopened = deserialize(serialize(doc));
  assert.deepEqual(reopened.doc.zones.map((z) => ({ kind: z.kind, label: z.label, color: z.color })),
    bands.map((z) => ({ kind: z.kind, label: z.label, color: z.color })), 'scene bands survive saving and reopening');
});

test('exploit findings group into an attack sequence band that frames every flow stage', () => {
  const doc = newDoc('Board');
  const res = buildSecurityIllustration(doc, exploitSet());
  const bands = doc.zones.filter((z) => z.kind === 'swimlane');
  assert.equal(bands.length, 1, 'one attack sequence band, no invented scenes');
  assert.equal(bands[0].label, 'Attack sequence');
  for (const id of res.targets.nodes) {
    const r = nodeRect(nodeById(doc, id));
    assert.ok(bands[0].x <= r.x && bands[0].y <= r.y && r.x + r.w <= bands[0].x + bands[0].w
      && r.y + r.h <= bands[0].y + bands[0].h, 'every flow stage stays inside the attack band');
  }
});
