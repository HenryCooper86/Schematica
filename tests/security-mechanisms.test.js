import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecurityIllustration, buildSecurityWalkthrough } from '../src/security-diagrams.js';
import { newDoc } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';
import { nodeRect, nodeMeta, rectsIntersect, contentBounds } from '../src/geometry.js';

const finding = (id, basis = 'source') => ({ id, kind: 'root_cause', title: id, detail: `${id} static explanation`,
  basis, view: 'none', evidence: basis === 'source' ? [{ sourceId: 'code', startLine: 1, endLine: 1 }] : [], targets: [] });
const item = (id, findingIds = ['copy']) => ({ id, label: id, value: '8 bytes', role: 'storage', findingIds });
function analysis(kind = 'memory') {
  return { version: 1, id: 'poc', title: 'Static copy explanation', cveId: '', status: 'not-provided', summary: 'Educational static reading.',
    generatedAt: '2026-10-22T00:00:00Z', sources: [{ id: 'code', name: 'copy.c', url: '', hash: 'a'.repeat(64),
      retrievedAt: '2026-10-22T00:00:00Z', text: 'char buffer[8];', startLine: 1, totalLines: 1, partial: false, warnings: [] }],
    findings: [finding('copy'), finding('conditional', 'inference'), finding('context', 'unknown')], relationships: [], warnings: [],
    explanations: [{ id: 'layout', title: 'Input and destination', kind, detail: 'Schematic source declarations; not a stack ABI.',
      panels: [{ id: 'destination', title: 'Destination', items: [item('buffer'), item('capacity')] }], links: [] }] };
}

test('memory cells stack, structured fields segment, and unrelated board content stays fixed', () => {
  for (const kind of ['memory', 'structure']) {
    const doc = newDoc();
    const original = { id: 'existing', kind: 'mcu', x: -40, y: 16, label: 'User MCU', sublabel: '', addr: '', rail: '', notes: '', color: null, status: null, flags: [] };
    doc.nodes.push(structuredClone(original));
    const result = buildSecurityIllustration(doc, analysis(kind), { view: 'mechanism' });
    assert.deepEqual(doc.nodes[0], original);
    const [a, b] = result.targets.nodes.map(id => doc.nodes.find(node => node.id === id));
    assert.equal(rectsIntersect(nodeRect(a), nodeRect(b)), false);
    assert.equal(rectsIntersect(nodeRect(a), nodeRect(original)), false);
    if (kind === 'memory') { assert.equal(a.x, b.x); assert.ok(b.y > a.y + nodeRect(a).h); }
    else { assert.equal(a.y, b.y); assert.ok(b.x > a.x + nodeRect(a).w); }
    const reopened = deserialize(serialize(doc));
    assert.deepEqual(reopened.warnings, []);
    assert.deepEqual(reopened.doc.securityAnalysis.explanations, doc.securityAnalysis.explanations);
    assert.equal(buildSecurityWalkthrough(reopened.doc, reopened.doc.securityAnalysis).view, 'mechanism');
    assert.ok(buildSecurityWalkthrough(reopened.doc, reopened.doc.securityAnalysis).stops.some(stop => stop.findingId === 'copy'));
  }
});

test('mixed evidence never promotes uncertain mechanism cells or pointer links', () => {
  const a = analysis();
  a.explanations[0].panels[0].items = [item('buffer', ['copy', 'conditional']), item('pointer', ['context'])];
  a.explanations[0].links = [{ from: 'buffer', to: 'pointer', label: 'may refer to', findingIds: ['copy', 'context'] }];
  const doc = newDoc();
  const result = buildSecurityIllustration(doc, a, { view: 'mechanism' });
  const [buffer, pointer] = result.targets.nodes.map(id => doc.nodes.find(node => node.id === id));
  assert.match(buffer.label, /\[inference\]$/);
  assert.match(pointer.label, /\[unknown\]$/);
  const wire = doc.wires.find(wire => wire.id === result.targets.wires[0]);
  assert.equal(wire.style, 'dotted');
  assert.match(wire.label, /\[unknown\]$/);
  assert.ok(doc.securityAnalysis.findings.find(f => f.id === 'context').targets.includes(wire.id));
});

test('newest mechanism build reports deleted targets rather than using an older cell', () => {
  const doc = newDoc();
  const first = buildSecurityIllustration(doc, analysis(), { view: 'mechanism' });
  const second = buildSecurityIllustration(doc, first.analysis, { view: 'mechanism' });
  doc.nodes = doc.nodes.filter(node => !second.targets.nodes.includes(node.id));
  const walkthrough = buildSecurityWalkthrough(doc, second.analysis, { view: 'mechanism' });
  assert.ok(walkthrough.missing.some(missing => missing.findingId === 'copy'));
  assert.deepEqual(walkthrough.stops, []);
});

test('capacity and coordinate failures leave the original board unchanged', () => {
  for (const reason of ['targets', 'coordinates', 'missing-scenes']) {
    const doc = newDoc(), a = analysis();
    if (reason === 'targets') a.findings[0].targets = Array.from({ length: 200 }, (_, i) => `old${i}`);
    if (reason === 'coordinates') doc.zones.push({ id: 'edge', x: 999990, y: 0, w: 10, h: 10, label: 'User edge', color: '#123456' });
    if (reason === 'missing-scenes') delete a.explanations;
    const snapshot = structuredClone(doc);
    assert.throws(() => buildSecurityIllustration(doc, a, { view: 'mechanism' }), /targets|coordinates|No mechanism/);
    assert.deepEqual(doc, snapshot);
  }
});

test('link-only evidence remains navigable and scene-wide uncertainty is not promoted', () => {
  const a = analysis();
  a.explanations[0].links = [{ from: 'buffer', to: 'capacity', label: 'context not included', findingIds: ['context'] }];
  const doc = newDoc();
  const result = buildSecurityIllustration(doc, a, { view: 'mechanism' });
  const walkthrough = buildSecurityWalkthrough(doc, result.analysis);
  const context = walkthrough.stops.find(stop => stop.findingId === 'context');
  assert.ok(result.targets.nodes.includes(context.node));
  assert.equal(context.basis, 'unknown');
  assert.match(doc.journey[0].caption, /\[unknown\]/);
  assert.equal(new Set(doc.journey.flatMap(chapter => chapter.stops.map(stop => stop.node))).size, result.targets.nodes.length);
});

test('long panel headings fit within their own zones and exported scene bounds', () => {
  const a = analysis();
  a.explanations[0].panels.push({ id: 'another', title: 'M'.repeat(240), items: [item('other')] });
  a.explanations[0].panels[0].title = 'W'.repeat(240);
  const doc = newDoc();
  buildSecurityIllustration(doc, a, { view: 'mechanism' });
  const [first, second] = doc.zones;
  const scene = contentBounds(doc);
  assert.ok(first.x + first.w < second.x);
  assert.ok(second.x + second.w <= scene.x + scene.w);
  assert.ok(first.w > 240 * 6.2);
});

test('state snapshots, aligned comparisons and interaction lanes use different spatial organization', () => {
  const layout = kind => {
    const a = analysis(kind);
    a.explanations[0].panels = [
      { id: 'left', title: 'Left', items: [item('a'), item('c')] },
      { id: 'right', title: 'Right', items: [item('b'), item('d')] },
    ];
    a.explanations[0].links = [
      { from: 'a', to: 'b', label: 'first exchange', findingIds: ['copy'] },
      { from: 'b', to: 'c', label: 'return', findingIds: ['copy'] },
    ];
    const doc = newDoc();
    const result = buildSecurityIllustration(doc, a, { view: 'mechanism' });
    if (kind === 'sequence') {
      const nodes = new Map(doc.nodes.map(node => [node.id, node]));
      assert.deepEqual(doc.journey[0].stops.map(stop => nodes.get(stop.node).label.split(' ')[0]), ['a', 'b', 'c', 'd']);
    }
    return result.targets.nodes.map(id => doc.nodes.find(node => node.id === id));
  };
  const [stateA, stateC, stateB] = layout('state');
  assert.equal(stateA.y, stateC.y);
  assert.equal(stateA.x, stateB.x);
  assert.ok(stateB.y > stateA.y);
  const [compareA, compareC, compareB] = layout('comparison');
  assert.equal(compareA.y, compareB.y);
  assert.ok(compareC.y > compareA.y);
  const [sequenceA, sequenceC, sequenceB] = layout('sequence');
  assert.equal(sequenceA.x, sequenceC.x);
  assert.ok(sequenceA.y < sequenceB.y && sequenceB.y < sequenceC.y);
});

function figurePlan(kind = 'attack') {
  const a = analysis();
  const cell = (id, assetKind, row) => {
    a.findings.push({ ...finding(id), kind: 'component', assetKind });
    return { id, label: id, value: `Hypothetical ${assetKind}`, role: 'neutral', assetKind, findingIds: [id],
      ...(row === undefined ? {} : { row }) };
  };
  a.explanations = [{ id: 'figure', title: 'Educational scenario', kind,
    detail: 'Synthetic composition; no product vulnerability or observed outcome is asserted.',
    panels: kind === 'attack' ? [
      { id: 'actor', title: 'Actor', placement: 'actor', items: [cell('attacker', 'attacker')] },
      { id: 'exchange', title: 'Messages', placement: 'exchange', items: [cell('request', 'httprequest'), cell('dump', 'memorydump')] },
      { id: 'target', title: 'Target', placement: 'target', items: [cell('app', 'phpapp'), cell('secrets', 'secretstore'), cell('limit', 'memorylimit'), cell('crash', 'processcrash')] },
    ] : [
      { id: 'actor', title: 'Actor', placement: 'actor', items: [cell('attacker', 'attacker')] },
      { id: 'exchange', title: 'Messages', placement: 'exchange', items: [0, 1, 2].map(row => cell(`request-${row}`, 'httprequest', row)) },
      { id: 'target', title: 'Applications', placement: 'target', items: ['wordpressapp', 'drupalapp', 'joomlaapp'].flatMap((asset, row) => [cell(`app-${row}`, asset, row), cell(`memory-${row}`, 'servermemory', row)]) },
      { id: 'outcomes', title: 'Conditional outcomes', placement: 'outcome', items: [0, 1, 2].map(row => cell(`result-${row}`, 'codeexec', row)) },
    ], links: kind === 'attack' ? [
      { from: 'attacker', to: 'request', label: 'sends', findingIds: ['attacker', 'request'] },
      { from: 'request', to: 'app', label: 'received', findingIds: ['request', 'app'] },
      { from: 'secrets', to: 'dump', label: 'hypothetical disclosed bytes', findingIds: ['secrets', 'dump'] },
      { from: 'dump', to: 'attacker', label: 'returns', findingIds: ['dump', 'attacker'] },
    ] : [0, 1, 2].flatMap(row => [
      { from: 'attacker', to: `request-${row}`, label: 'sends', findingIds: ['attacker', `request-${row}`] },
      { from: `request-${row}`, to: `app-${row}`, label: 'received', findingIds: [`request-${row}`, `app-${row}`] },
    ]) }];
  return a;
}

const middleY = node => { const rect = nodeRect(node); return rect.y + rect.h / 2; };

test('illustrated attack composes real actors and request/return assets without invented links or nested zones', () => {
  const doc = newDoc();
  const built = buildSecurityIllustration(doc, figurePlan(), { view: 'mechanism' });
  const node = name => doc.nodes.find(node => node.label.startsWith(`${name} [`));
  assert.equal(node('attacker').kind, 'attacker');
  assert.equal(node('request').kind, 'httprequest');
  assert.ok(node('attacker').x < node('request').x && node('request').x < node('app').x);
  assert.ok(node('app').x < node('secrets').x);
  const response = doc.wires.find(wire => wire.from.node === node('dump').id && wire.to.node === node('attacker').id);
  assert.equal(response.from.port, 'w');
  assert.equal(response.to.port, 'e');
  assert.equal(response.arrow, 'fwd');
  assert.equal(doc.wires.length, 4, 'only the source-defined relationships are drawn');
  for (const a of doc.zones) for (const b of doc.zones) if (a !== b) assert.equal(rectsIntersect(a, b), false);
  assert.equal(new Set(doc.journey[0].stops.map(stop => stop.node)).size, built.targets.nodes.length);
  assert.deepEqual(deserialize(serialize(doc)).warnings, []);
});

test('parallel target rows align requests, application internals and outcomes beside a shared actor', () => {
  const doc = newDoc();
  buildSecurityIllustration(doc, figurePlan('parallel'), { view: 'mechanism' });
  const node = name => doc.nodes.find(node => node.label.startsWith(`${name} [`));
  for (const row of [0, 1, 2]) {
    assert.ok(node(`request-${row}`).x < node(`app-${row}`).x);
    assert.ok(node(`app-${row}`).x < node(`memory-${row}`).x);
    assert.ok(node(`memory-${row}`).x < node(`result-${row}`).x);
    assert.ok(Math.abs(middleY(node(`request-${row}`)) - middleY(node(`app-${row}`))) <= 8);
    assert.ok(Math.abs(middleY(node(`app-${row}`)) - middleY(node(`result-${row}`))) <= 8);
  }
  assert.ok(middleY(node('request-0')) < middleY(node('request-1')));
  assert.ok(middleY(node('request-1')) < middleY(node('request-2')));
  const first = nodeRect(node('app-0')), last = nodeRect(node('app-2'));
  assert.ok(Math.abs(middleY(node('attacker')) - (first.y + last.y + last.h) / 2) <= 8);
});

test('unestablished or unsupported mechanism asset hints cannot depict a concrete actor or target', () => {
  for (const missing of ['unknown', 'unsupported']) {
    const a = figurePlan();
    const grounding = a.findings.find(finding => finding.id === 'attacker');
    if (missing === 'unknown') { grounding.basis = 'unknown'; grounding.evidence = []; }
    else delete grounding.assetKind;
    const doc = newDoc();
    buildSecurityIllustration(doc, a, { view: 'mechanism' });
    const actor = doc.nodes.find(node => node.label.startsWith('attacker ['));
    assert.equal(actor.kind, 'custom', 'an unsupported concrete pictogram is suppressed');
    assert.equal(actor.part.icon.kind, undefined);
  }
});

test('row-specific and shared actors do not overlap and a tall shared actor remains centered', () => {
  for (const mixed of [false, true]) {
    const a = figurePlan('parallel'), scene = a.explanations[0];
    for (const panel of scene.panels) if (panel.placement !== 'actor') panel.items = panel.items.filter(item => item.row === 0);
    scene.links = scene.links.filter(link => !/-[12]$/.test(link.to));
    if (mixed) {
      a.findings.push({ ...finding('row-actor'), kind: 'component', assetKind: 'attacker' });
      scene.panels[0].items.push({ id: 'row-actor', label: 'Row actor', value: 'Independent row actor',
        role: 'neutral', assetKind: 'attacker', findingIds: ['row-actor'], row: 0 });
    } else scene.panels[0].items[0].value = 'A long declared prerequisite for this hypothetical actor. '.repeat(12);
    const doc = newDoc();
    buildSecurityIllustration(doc, a, { view: 'mechanism' });
    const shared = doc.nodes.find(node => node.label.startsWith('attacker ['));
    const request = doc.nodes.find(node => node.label.startsWith('request-0 ['));
    assert.ok(Math.abs(middleY(shared) - middleY(request)) <= 8);
    for (const node of doc.nodes) if (node !== shared) assert.equal(rectsIntersect(nodeRect(shared), nodeRect(node)), false);
  }
});

test('existing threat glyph selections retain essential explanatory values on the diagram', () => {
  for (const assetKind of ['threatactor', 'vulnerability', 'exploit']) {
    const a = analysis();
    a.findings[0].assetKind = assetKind;
    a.explanations[0].panels[0].items[0].assetKind = assetKind;
    a.explanations[0].panels[0].items[0].value = 'Required source condition, not an observed outcome';
    const doc = newDoc();
    buildSecurityIllustration(doc, a, { view: 'mechanism' });
    const cell = doc.nodes.find(node => node.label.startsWith('buffer ['));
    assert.ok(nodeMeta(cell).some(meta => meta.text === a.explanations[0].panels[0].items[0].value));
  }
});
