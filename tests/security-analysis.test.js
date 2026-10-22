import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateSecurityAnalysis, securityEvidence, securityAnalysisHTML } from '../src/security-analysis.js';
import { securityAssetKind } from '../src/security-assets.js';
import { Store } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';
import { createEditPreview } from '../src/ai/preview.js';
import { buildTechnicalReport, technicalReportHTML } from '../src/technical-report.js';

const time = '2026-10-20T12:00:00.000Z';
function fixture() {
  const text = 'Advisory: the parser accepts an oversized length.\nThe fix rejects lengths above the allocated buffer.\nPRIVATE_UNCITED_SOURCE_LINE';
  return { version: 1, id: 'analysis-1', title: 'Parser source review', cveId: 'CVE-2025-12345', status: 'published',
    summary: 'The supplied advisory describes an unchecked length. This has not been reproduced.', generatedAt: time,
    sources: [{ id: 'source-1', name: 'advisory.md', url: 'https://example.com/advisory', retrievedAt: time,
      hash: createHash('sha256').update(text).digest('hex'), text, startLine: 1, totalLines: 3, partial: false, warnings: [] }],
    findings: [{ id: 'cause', kind: 'root_cause', title: 'Unchecked length', detail: 'The advisory identifies the parser boundary.',
      basis: 'source', view: 'exploit', evidence: [{ sourceId: 'source-1', startLine: 1, endLine: 1 }], targets: [] },
    { id: 'fix', kind: 'mitigation', title: 'Check the length', detail: 'The advisory describes a bound check.', basis: 'source',
      view: 'mitigation', evidence: [{ sourceId: 'source-1', startLine: 2, endLine: 2 }], targets: [] }],
    relationships: [], warnings: [] };
}

test('citations resolve exact retained line ranges and reject omitted source lines', () => {
  const analysis = fixture();
  const excerpt = securityEvidence(analysis, analysis.findings[1].evidence[0]);
  assert.equal(excerpt.text, 'The fix rejects lengths above the allocated buffer.');
  analysis.sources[0] = { ...analysis.sources[0], text: 'included line 8\nincluded line 9', startLine: 8, totalLines: 15, partial: true };
  analysis.findings[0].evidence = [{ sourceId: 'source-1', startLine: 8, endLine: 9 }];
  analysis.findings[1].evidence = [];
  analysis.findings[1].basis = 'unknown';
  assert.equal(validateSecurityAnalysis(analysis).sources[0].partial, true);
  assert.equal(securityEvidence(analysis, analysis.findings[0].evidence[0]).text, 'included line 8\nincluded line 9');
  analysis.findings[0].evidence[0].endLine = 10;
  assert.throws(() => validateSecurityAnalysis(analysis), /outside the included lines/);
});

test('source claims require evidence and logical relationships cannot invent endpoints', () => {
  const analysis = fixture();
  analysis.findings[0].evidence = [];
  assert.throws(() => validateSecurityAnalysis(analysis), /requires evidence/);
  analysis.findings[0].basis = 'inference';
  analysis.relationships = [{ id: 'r', from: 'cause', to: 'absent', label: 'May allow', basis: 'inference', view: 'exploit', evidence: [] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /existing, distinct findings/);
  analysis.relationships[0].to = 'fix';
  assert.equal(validateSecurityAnalysis(analysis).relationships[0].basis, 'inference');
});

test('invalid saved evidence is rejected with a diagnostic rather than silently changing a citation', () => {
  const store = new Store();
  store.doc.securityAnalysis = fixture();
  store.doc.securityAnalysis.findings[0].evidence[0].sourceId = 'missing';
  const reopened = deserialize(serialize(store.doc));
  assert.equal(reopened.doc.securityAnalysis, undefined);
  assert.match(reopened.warnings.join('\n'), /Evidence source not found/);
  assert.deepEqual(reopened.doc.nodes, []);
});

test('analysis preview is isolated, one undo step, portable, and cannot apply across board edits', () => {
  const store = new Store(), preview = createEditPreview(store);
  const analysis = fixture();
  preview.draft.apply(doc => { doc.securityAnalysis = analysis; });
  assert.equal(store.doc.securityAnalysis, undefined);
  assert.equal(preview.summary().comparison.changes.find(change => change.fields?.[0].field === 'securityAnalysis').collection, 'board');
  preview.apply();
  assert.deepEqual(deserialize(serialize(store.doc)).doc.securityAnalysis, analysis);
  store.undo();
  assert.equal(store.doc.securityAnalysis, undefined);
  store.redo();
  assert.deepEqual(store.doc.securityAnalysis, analysis);
  const stale = createEditPreview(store);
  stale.draft.apply(doc => { doc.securityAnalysis.summary = 'Revised analysis'; });
  store.apply(doc => { doc.title = 'Another edit'; });
  assert.throws(() => stale.apply(), /board changed/);
  assert.equal(store.doc.securityAnalysis.summary, analysis.summary);
});

test('standalone reports escape untrusted content and distinguish excerpts from full sources', () => {
  const analysis = fixture();
  analysis.findings[0].title = '<img src=x onerror=alert(1)>';
  analysis.sources[0].name = '<script>bad()</script>.md';
  const html = securityAnalysisHTML(analysis, { includeSources: false });
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;.md'));
  assert.ok(html.includes('Advisory: the parser accepts an oversized length.'));
  assert.ok(!html.includes('PRIVATE_UNCITED_SOURCE_LINE'));
  assert.ok(securityAnalysisHTML(analysis, { includeSources: true }).includes('PRIVATE_UNCITED_SOURCE_LINE'));
  analysis.sources[0].url = 'javascript:alert(1)';
  assert.throws(() => securityAnalysisHTML(analysis), /public HTTP/);
});

test('technical report selection and comparison do not leak unselected security source text', () => {
  const store = new Store();
  store.doc.securityAnalysis = fixture();
  const baseline = structuredClone(store.doc);
  store.doc.securityAnalysis.sources[0].text += '\nMORE_PRIVATE_SOURCE';
  store.doc.securityAnalysis.sources[0].totalLines = 4;
  const omitted = technicalReportHTML(buildTechnicalReport(store.doc, { baseline, created: time, settings: { sections: ['changes'] } }));
  assert.ok(!omitted.includes('PRIVATE_UNCITED_SOURCE_LINE'));
  assert.ok(!omitted.includes('MORE_PRIVATE_SOURCE'));
  const excerpts = technicalReportHTML(buildTechnicalReport(store.doc, { baseline, created: time, settings: { sections: ['security', 'changes'] } }));
  assert.ok(excerpts.includes('Advisory: the parser accepts an oversized length.'));
  assert.ok(!excerpts.includes('PRIVATE_UNCITED_SOURCE_LINE'));
  const full = technicalReportHTML(buildTechnicalReport(store.doc, { created: time, settings: { sections: ['security'], securitySources: true } }));
  assert.ok(full.includes('PRIVATE_UNCITED_SOURCE_LINE'));
});

test('source collections reject forged completeness and oversized evidence ranges', () => {
  const analysis = fixture();
  analysis.sources[0].totalLines = 500;
  assert.throws(() => validateSecurityAnalysis(analysis), /must be marked partial/);
  analysis.sources[0].partial = true;
  analysis.sources[0].text = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`).join('\n');
  analysis.findings[0].evidence[0] = { sourceId: 'source-1', startLine: 1, endLine: 201 };
  assert.throws(() => validateSecurityAnalysis(analysis), /at most 200 lines/);
});

test('readCoverage validates duplicate ids, unknown sources, bounds and canonical ordering', () => {
  const analysis = fixture();
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [{ startLine: 1, endLine: 2 }] }];
  assert.deepEqual(validateSecurityAnalysis(analysis).readCoverage, analysis.readCoverage);
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [] }, { sourceId: 'source-1', ranges: [] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /Duplicate read coverage/);
  analysis.readCoverage = [{ sourceId: 'ghost', ranges: [] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /unknown source/);
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [{ startLine: 1, endLine: 4 }] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /outside retained lines/);
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [{ startLine: 1, endLine: 1 }, { startLine: 2, endLine: 2 }] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /sorted, merged/);
});

test('boundaryRelation requires exactly one boundary endpoint when non-none', () => {
  const analysis = fixture();
  analysis.findings.push({ id: 'trust', kind: 'boundary', title: 'Trust boundary', detail: 'A boundary.', basis: 'unknown', view: 'none', evidence: [], targets: [] });
  analysis.relationships = [{ id: 'r1', from: 'cause', to: 'trust', label: 'inside', basis: 'unknown', view: 'architecture', evidence: [], boundaryRelation: 'inside' }];
  assert.equal(validateSecurityAnalysis(analysis).relationships[0].boundaryRelation, 'inside');
  analysis.relationships[0].to = 'fix';
  assert.throws(() => validateSecurityAnalysis(analysis), /exactly one boundary endpoint/);
  delete analysis.relationships[0].boundaryRelation;
  assert.equal(validateSecurityAnalysis(analysis).relationships[0].boundaryRelation, undefined);
});

test('historical analyses without readCoverage disclose unknown coverage, not fabricated lines', () => {
  const analysis = fixture();
  const html = securityAnalysisHTML(analysis, { includeSources: false });
  assert.ok(html.includes('Model-read coverage not recorded'));
  assert.ok(!html.includes('Complete lines delivered to the model'));
  assert.equal(validateSecurityAnalysis(analysis).readCoverage, undefined);
});

test('reports disclose delivered lines and the remaining unassessed lines', () => {
  const analysis = fixture();
  analysis.sources[0] = { ...analysis.sources[0], text: Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'), totalLines: 500 };
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [{ startLine: 1, endLine: 120 }] }];
  const html = securityAnalysisHTML(analysis, { includeSources: false });
  assert.ok(html.includes('1–120'));
  assert.ok(html.includes('121–500'));
  assert.ok(html.includes('left unassessed'));
  assert.ok(!html.includes('line 121'), 'unassessed lines must not leak source text');
});

test('missing per-source coverage stays unknown while an explicit empty range records no delivery', () => {
  const analysis = fixture();
  analysis.sources.push({ ...analysis.sources[0], id: 'source-2', name: 'unrecorded.md' });
  analysis.readCoverage = [{ sourceId: 'source-1', ranges: [] }];
  const html = securityAnalysisHTML(analysis);
  const [recorded, unrecorded] = html.split('id="security-source-2"');
  assert.ok(recorded.includes('comprehension): none.'));
  assert.ok(unrecorded.includes('Model-read coverage not recorded'));
  assert.ok(!unrecorded.includes('comprehension): none.'));
});

test('reserved and rejected reports mark each finding as non-established', () => {
  const rejected = fixture();
  rejected.status = 'rejected';
  const html = securityAnalysisHTML(rejected, { includeSources: false });
  assert.equal((html.match(/This item is not evidence of an established vulnerability/g) || []).length, 2);
  assert.ok(html.includes('CVE record is rejected'));
  const published = securityAnalysisHTML(fixture(), { includeSources: false });
  assert.ok(!published.includes('This item is not evidence of an established vulnerability'));
});

test('illustrations validate view, finding and target references without fabricating historical builds', () => {
  const analysis = fixture();
  analysis.findings[0].targets = ['board-node-1'];
  analysis.illustrations = [{ view: 'architecture', chapter: '', items: [{ findingId: 'cause', target: 'board-node-1' }] }];
  assert.deepEqual(validateSecurityAnalysis(analysis).illustrations, analysis.illustrations);
  analysis.illustrations = [{ view: 'architecture', chapter: '', items: [{ findingId: 'ghost', target: 'board-node-1' }] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /unknown finding/);
  analysis.illustrations = [{ view: 'architecture', chapter: '', items: [{ findingId: 'cause', target: 'missing-node' }] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /not a board target/);
  analysis.illustrations = [{ view: 'nope', chapter: '', items: [] }];
  assert.throws(() => validateSecurityAnalysis(analysis), /unsupported value/);
  assert.equal(validateSecurityAnalysis(fixture()).illustrations, undefined);
});

test('securityAssetKind honours explicit supported assets and otherwise resolves role-neutral glyphs', () => {
  assert.equal(securityAssetKind({ kind: 'affected', basis: 'source', assetKind: 'linux' }), 'linux');
  assert.equal(securityAssetKind({ kind: 'mitigation', basis: 'inference', assetKind: 'siem' }), 'siem',
    'an inferred asset stays visible with its inference basis');
  assert.equal(securityAssetKind({ kind: 'affected', basis: 'unknown', assetKind: 'linux' }), 'generic',
    'unknown applicability never draws a speculative concrete asset');
  assert.equal(securityAssetKind({ kind: 'affected', basis: 'source', assetKind: 'process' }), 'generic',
    'flowchart placeholders are not accepted as explicit assets');
  assert.equal(securityAssetKind({ kind: 'affected', basis: 'source', assetKind: '<img src=x>' }), 'generic');
});

test('assetKind persists through validation and serialization while unsupported saved kinds are rejected', () => {
  const analysis = fixture();
  assert.equal(validateSecurityAnalysis(analysis).findings[0].assetKind, undefined,
    'saved analyses without assetKind stay valid and unchanged');
  analysis.findings[0].assetKind = 'webserver';
  assert.equal(validateSecurityAnalysis(analysis).findings[0].assetKind, 'webserver');
  const store = new Store();
  store.doc.securityAnalysis = analysis;
  const reopened = deserialize(serialize(store.doc));
  assert.equal(reopened.doc.securityAnalysis.findings[0].assetKind, 'webserver');
  for (const bad of ['generic', 'process', 'startend', 'not-a-kind"><svg onload=1>', '']) {
    analysis.findings[0].assetKind = bad;
    assert.throws(() => validateSecurityAnalysis(analysis), /unsupported value|text limit/, `assetKind "${bad}" must be rejected`);
  }
  analysis.findings[0].assetKind = 'webserver';
  analysis.findings[0].basis = 'unknown';
  const kept = validateSecurityAnalysis(analysis);
  assert.equal(kept.findings[0].assetKind, 'webserver',
    'an unknown-basis hint stays readable in the record and is only clamped at render time');
  assert.notEqual(securityAssetKind(kept.findings[0]), 'webserver',
    'an unknown-basis saved hint must not depict a concrete server');
});

function explanationAnalysis() {
  const analysis = fixture();
  analysis.findings.push({ id: 'uncertain', kind: 'unknown', title: 'Reachability not established',
    detail: 'No retained line shows a caller reaching the parser.', basis: 'unknown', view: 'none', evidence: [], targets: [] });
  analysis.explanations = [{
    id: 'scene-1', title: 'Parser buffer layout', kind: 'memory',
    detail: 'Schematic reading of the declared buffers; not an observed runtime layout.',
    panels: [{ id: 'panel-1', title: 'Declared buffers', items: [
      { id: 'item-length', label: 'Supplied length', value: 'length field', role: 'input', findingIds: ['cause'] },
      { id: 'item-buffer', label: 'Fixed buffer', value: '', role: 'storage', findingIds: ['cause', 'uncertain'] },
    ] }],
    links: [{ from: 'item-length', to: 'item-buffer', label: 'overwrites when unchecked', findingIds: ['cause'] }],
  }];
  return analysis;
}

test('explanations validate grounding, endpoints and limits while staying optional', () => {
  const analysis = explanationAnalysis();
  assert.deepEqual(validateSecurityAnalysis(analysis).explanations, analysis.explanations);
  assert.equal(validateSecurityAnalysis(fixture()).explanations, undefined,
    'older analyses without explanations remain valid');
  const rejects = [
    [a => { a.explanations.push({ ...a.explanations[0] }); }, /Duplicate explanation id/],
    [a => { a.explanations[0].panels = []; }, /requires at least one panel/],
    [a => { a.explanations[0].panels[0].items = []; }, /requires at least one item/],
    [a => { a.explanations[0].panels[0].items[1].id = 'item-length'; }, /Duplicate item id in explanation/],
    [a => { a.explanations[0].panels[0].items[0].findingIds = []; }, /must reference at least one existing finding/],
    [a => { a.explanations[0].panels[0].items[0].findingIds = ['ghost']; }, /references an unknown finding/],
    [a => { a.explanations[0].panels[0].items[0].findingIds = ['cause', 'cause']; }, /repeats finding id/],
    [a => { a.explanations[0].links[0].to = 'ghost-item'; }, /references an unknown item/],
    [a => { a.explanations[0].links[0].to = 'item-length'; }, /distinct items/],
    [a => { a.explanations[0].kind = 'layout'; }, /unsupported value/],
    [a => { a.explanations[0].panels[0].items[0].role = 'widget'; }, /unsupported value/],
    [a => { a.explanations.push(...Array.from({ length: 7 }, (_, i) => ({ ...a.explanations[0], id: `extra-${i}` }))); }, /collection limit/],
    [a => { a.explanations[0].coordinates = '10,10'; }, /Unknown .* field/],
  ];
  for (const [mutate, pattern] of rejects) {
    const value = explanationAnalysis();
    mutate(value);
    assert.throws(() => validateSecurityAnalysis(value), pattern);
  }
});

test('reports show explanation panels, items and links with derived weakest basis and citations', () => {
  const html = securityAnalysisHTML(explanationAnalysis());
  assert.ok(html.includes('Mechanism explanations'));
  assert.ok(html.includes('Parser buffer layout'));
  assert.ok(html.includes('Memory / object layout'));
  assert.ok(html.includes('Declared buffers'));
  assert.ok(html.includes('Supplied length') && html.includes('Fixed buffer'));
  assert.ok(html.includes('overwrites when unchecked'));
  assert.ok(html.includes('Supplied length → Fixed buffer'), 'link endpoints render as item labels');
  assert.ok(html.includes('Unknown — evidence missing'), 'the weakest referenced basis is visible');
  assert.ok(html.includes('Source-backed statement'), 'a fully grounded item keeps its source basis');
  assert.ok(html.includes('#security-source-1'), 'citations are the referenced findings own evidence');
  assert.ok(!securityAnalysisHTML(fixture()).includes('Mechanism explanations'),
    'analyses without explanations report no mechanism section');
});

test('explanations survive save and reopen; invalid saved explanations are dropped with a diagnostic', () => {
  const store = new Store();
  store.doc.securityAnalysis = explanationAnalysis();
  const reopened = deserialize(serialize(store.doc));
  assert.deepEqual(reopened.doc.securityAnalysis.explanations, explanationAnalysis().explanations);
  store.doc.securityAnalysis = explanationAnalysis();
  store.doc.securityAnalysis.explanations[0].links[0].to = 'ghost-item';
  const broken = deserialize(serialize(store.doc));
  assert.equal(broken.doc.securityAnalysis, undefined);
  assert.match(broken.warnings.join('\n'), /references an unknown item/);
  assert.deepEqual(broken.doc.nodes, []);
});

function composedAnalysis() {
  const analysis = fixture();
  analysis.findings[0].assetKind = 'webserver';
  analysis.explanations = [
    { id: 'attack-scene', title: 'Oversized request against the parser host', kind: 'attack',
      detail: 'Semantic composition of the referenced findings; not a network or containment claim.',
      panels: [
        { id: 'a-actor', title: 'Requester', placement: 'actor', items: [
          { id: 'a-who', label: 'Requesting client', value: 'sends the length', role: 'input', findingIds: ['cause'] }] },
        { id: 'a-exchange', title: 'Request', placement: 'exchange', items: [
          { id: 'a-req', label: 'Oversized length', value: '', role: 'input', findingIds: ['cause'] }] },
        { id: 'a-target', title: 'Parser host', placement: 'target', items: [
          { id: 'a-host', label: 'Parser buffer', value: '', role: 'storage', assetKind: 'webserver', findingIds: ['cause'] }] },
        { id: 'a-outcome', title: 'Conditional outcome', placement: 'outcome', items: [
          { id: 'a-crash', label: 'Parser failure', value: 'only if the described path is reached', role: 'result', findingIds: ['fix'] }] },
      ],
      links: [{ from: 'a-req', to: 'a-host', label: 'overflows when unchecked', findingIds: ['cause'] }] },
    { id: 'parallel-scene', title: 'Same mechanism across deployments', kind: 'parallel',
      detail: 'One row per described deployment; outcomes stay tied to their own findings.',
      panels: [
        { id: 'p-actor', title: 'Shared requester', placement: 'actor', items: [
          { id: 'p-who', label: 'Requesting client', value: '', role: 'input', findingIds: ['cause'] }] },
        { id: 'p-targets', title: 'Affected deployments', placement: 'target', items: [
          { id: 'p-t0', label: 'Deployment A', value: '', role: 'storage', row: 0, findingIds: ['cause'] },
          { id: 'p-t1', label: 'Deployment B', value: '', role: 'storage', row: 7, findingIds: ['cause'] }] },
        { id: 'p-outcomes', title: 'Conditional outcomes', placement: 'outcome', items: [
          { id: 'p-o1', label: 'Parser failure', value: '', role: 'result', row: 1, findingIds: ['fix'] }] },
      ],
      links: [] },
  ];
  return analysis;
}

test('composed scene kinds require placements and parallel rows while older scenes stay valid', () => {
  const analysis = composedAnalysis();
  assert.deepEqual(validateSecurityAnalysis(analysis).explanations, analysis.explanations,
    'supported placements, rows and grounded item assets persist unchanged');
  assert.equal(validateSecurityAnalysis(explanationAnalysis()).explanations[0].panels[0].placement, undefined,
    'the five original kinds keep validating without placement or row');
  const rejects = [
    [a => { delete a.explanations[0].panels[1].placement; }, /requires a placement/],
    [a => { a.explanations[0].panels[1].placement = 'network'; }, /unsupported value/],
    [a => { delete a.explanations[1].panels[1].items[0].row; }, /requires a row/],
    [a => { delete a.explanations[1].panels[2].items[0].row; }, /requires a row/],
    [a => { a.explanations[1].panels[1].items[0].row = 8; }, /must be a safe integer/],
    [a => { a.explanations[1].panels[1].items[0].row = -1; }, /must be a safe integer/],
    [a => { a.explanations[1].panels[1].items[0].row = 1.5; }, /must be a safe integer/],
    [a => { a.explanations[1].panels[1].items[0].row = '1'; }, /must be a safe integer/],
    [a => { a.explanations[0].panels[2].items[0].assetKind = 'not-a-kind'; }, /unsupported value/],
    [a => { a.explanations[0].panels[2].items[0].assetKind = 'generic'; }, /unsupported value/],
    [a => { a.explanations[1].panels[1].items[0].x = 4; }, /Unknown .* field/],
  ];
  for (const [mutate, pattern] of rejects) {
    const value = composedAnalysis();
    mutate(value);
    assert.throws(() => validateSecurityAnalysis(value), pattern);
  }
});

test('ungrounded saved item asset hints stay inert data instead of invalidating the record', () => {
  const noMatch = composedAnalysis();
  delete noMatch.findings[0].assetKind;
  assert.equal(validateSecurityAnalysis(noMatch).explanations[0].panels[2].items[0].assetKind, 'webserver',
    'a structurally valid hint without a same-asset finding remains saved data for renderers to suppress');
  const unknownBasis = composedAnalysis();
  unknownBasis.findings[0].basis = 'unknown';
  assert.equal(validateSecurityAnalysis(unknownBasis).explanations[0].panels[2].items[0].assetKind, 'webserver',
    'an unknown-basis grounding finding also keeps the hint as data');
});

test('composed scenes save and reopen with their hints; invalid ones drop with a diagnostic', () => {
  const store = new Store();
  store.doc.securityAnalysis = composedAnalysis();
  const reopened = deserialize(serialize(store.doc));
  assert.deepEqual(reopened.doc.securityAnalysis.explanations, composedAnalysis().explanations);
  store.doc.securityAnalysis = composedAnalysis();
  store.doc.securityAnalysis.explanations[1].panels[1].items[0].row = 9;
  const broken = deserialize(serialize(store.doc));
  assert.equal(broken.doc.securityAnalysis, undefined);
  assert.match(broken.warnings.join('\n'), /must be a safe integer/);
});

