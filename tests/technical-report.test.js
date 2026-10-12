import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire } from '../src/state.js';
import { normalizeEngineering } from '../src/engineering.js';
import { serialize, deserialize } from '../src/serialize.js';
import { designFingerprint, reviewState, requirementFingerprint } from '../src/workflows.js';
import { groupSubsystem } from '../src/subsystems.js';

const created = '2026-10-12T08:30:00.000Z';
const reportAPI = () => import('../src/technical-report.js');
function fixture() {
  const store = new Store();
  store.doc.title = 'Sensor gateway';
  const controller = addNode(store, 'mcu', 0, 0);
  const sensor = addNode(store, 'temp', 350, 0);
  addWire(store, 'i2c', { node: controller, port: 'i2c' }, { node: sensor, port: 'i2c' });
  store.doc.engineering = normalizeEngineering({ requirements: [{ id: 'REQ-1', text: 'Read temperature',
    owner: 'Morgan', targets: [sensor], status: 'verified', evidence: 'bench-results.pdf', method: 'Bench test' }] });
  return { store, controller, sensor };
}

test('report context and section choices survive board save and reopen', () => {
  const store = new Store();
  store.doc.engineering = { technicalReport: {
    title: 'Sensor gateway technical report', organization: 'Example Engineering',
    author: 'Morgan', recipient: 'Client integration team', revision: 'B',
    date: '2026-10-12', status: 'review', summary: 'Measure temperature.',
    scope: 'Sensor and controller integration.', architecture: 'I2C connects the sensor.',
    risks: 'Bench testing is outstanding.', nextSteps: 'Complete the bench test.',
    sections: ['architecture', 'interfaces', 'verification'], logo: '',
  } };
  const reopened = deserialize(serialize(store.doc)).doc;
  assert.deepEqual(reopened.engineering.technicalReport, store.doc.engineering.technicalReport);
});

test('imported report settings bound text and reject unsafe branding and invalid choices', () => {
  const report = normalizeEngineering({ technicalReport: {
    title: 'x'.repeat(1000), summary: 'y'.repeat(21000), date: '2026-02-30',
    status: 'approved', sections: ['bom', 'bad', 'bom'], logo: 'https://tracker.example/logo.png',
  } }).technicalReport;
  assert.ok(report, 'Report settings should be preserved and normalized');
  assert.equal(report.title.length, 240);
  assert.equal(report.summary.length, 20000);
  assert.equal(report.date, '');
  assert.equal(report.status, 'draft');
  assert.deepEqual(report.sections, ['bom']);
  assert.equal(report.logo, '');
});

test('report presentation edits keep an existing architecture review current', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  const fingerprint = designFingerprint(store.doc);
  const review = { revisionFingerprint: fingerprint, status: 'approved' };
  store.doc.engineering = { technicalReport: { summary: 'Updated client summary.' } };
  assert.equal(designFingerprint(store.doc), fingerprint);
  assert.equal(reviewState(store.doc, review), 'approved');
});

test('technical reports snapshot the project and distinguish unassessed interfaces and stale evidence', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store } = fixture();
  const before = serialize(store.doc);
  const report = buildTechnicalReport(store.doc, { created });
  assert.equal(report.source.title, 'Sensor gateway');
  assert.equal(report.created, created);
  assert.equal(report.summary.components, 2);
  assert.equal(report.summary.coverage.checked, 0);
  assert.equal(report.summary.coverage.unassessed, 1);
  assert.equal(report.summary.requirements.total, 1);
  assert.equal(report.summary.requirements.verified, 0);
  assert.equal(report.verification[0].needsReview, true);
  assert.equal(serialize(store.doc), before, 'Generating a report must not edit the board');
  store.doc.nodes[0].label = 'A later edit';
  assert.doesNotMatch(report.figures[0].svg, /A later edit/);
});

test('current requirement evidence appears only when its saved fingerprint still matches', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store } = fixture();
  const requirement = store.doc.engineering.requirements[0];
  requirement.verifiedFingerprint = requirementFingerprint(store.doc, requirement);
  assert.equal(buildTechnicalReport(store.doc, { created }).summary.requirements.verified, 1);
  store.doc.nodes[1].sublabel = 'Different sensor';
  assert.equal(buildTechnicalReport(store.doc, { created }).summary.requirements.verified, 0);
});

test('report figures and component totals include internal subsystem designs', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store, controller, sensor } = fixture();
  groupSubsystem(store, [controller, sensor], 'Sensing subsystem');
  const report = buildTechnicalReport(store.doc, { created });
  assert.equal(report.summary.components, 2);
  assert.equal(report.summary.subsystems, 1);
  assert.deepEqual(report.figures.map(f => f.title), ['Sensor gateway', 'Sensor gateway / Sensing subsystem']);
  assert.equal(report.summary.coverage.total, 1);
  assert.equal(report.requirements.filter(r => r.scopeTitle === 'Sensor gateway / Sensing subsystem').length, 1);
});

test('selected sections control exported content without hiding the overall review summary', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store } = fixture();
  const html = technicalReportHTML(buildTechnicalReport(store.doc, { created,
    settings: { summary: 'Client summary', sections: ['interfaces'] } }));
  assert.match(html, /Client summary/);
  assert.match(html, /id="interfaces"/);
  assert.doesNotMatch(html, /id="architecture"|id="bom"|id="requirements"/);
  assert.match(html, /id="risks"/);
  assert.match(html, /1 unassessed/);
  assert.doesNotMatch(html, /<iframe|<script|bench-results\.pdf/);
});

test('report text and evidence references are escaped and diagrams are self-contained images', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store } = fixture();
  store.doc.nodes[0].label = '<script>bad()</script>';
  store.doc.engineering.requirements[0].evidence = 'javascript:bad()';
  const html = technicalReportHTML(buildTechnicalReport(store.doc, { created, settings: {
    organization: '\"><img src="https://tracker.example/x">', summary: '<script>bad()</script>',
  } }));
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|<img src="https:|href="javascript:/);
  assert.match(html, /src="data:image\/svg\+xml/);
  assert.match(html, /javascript:bad\(\)/);
});

test('comparison includes design changes while excluding report-only edits', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store } = fixture();
  const baseline = structuredClone(store.doc);
  store.doc.engineering.technicalReport = { summary: 'Client report', sections: ['changes'] };
  assert.deepEqual(buildTechnicalReport(store.doc, { created, baseline }).comparison.changes, []);
  store.doc.nodes[0].sublabel = 'New controller';
  const report = buildTechnicalReport(store.doc, { created, baseline });
  assert.equal(report.comparison.changes.length, 1);
  assert.equal(report.comparison.changes[0].fields[0].field, 'sublabel');
  assert.ok(report.source.baselineFingerprint);
});

test('an empty project and an unselected comparison baseline remain explicitly incomplete', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const report = buildTechnicalReport(new Store().doc, { created, settings: { sections: ['changes'] } });
  assert.equal(report.summary.components, 0);
  assert.equal(report.summary.coverage.applicable, 0);
  assert.equal(report.summary.ready, false);
  const html = technicalReportHTML(report);
  assert.match(html, /Project summary has not been provided/);
  assert.match(html, /No comparison baseline selected/);
  assert.match(html, /No applicable interfaces/);
});

test('requirement allocations use scope-local component labels and retain missing targets', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store, sensor } = fixture();
  store.doc.nodes.find(n => n.id === sensor).label = 'Sensor connector';
  store.doc.engineering.requirements[0].targets.push('missing-component');
  const report = buildTechnicalReport(store.doc, { created });
  assert.deepEqual(report.verification[0].allocationLabels, ['Sensor connector', 'Missing item: missing-component']);
  assert.match(technicalReportHTML(report), /Sensor connector, Missing item: missing-component/);
});

test('revision comparisons show before and after values even when other detail sections are omitted', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store } = fixture();
  store.doc.nodes[0].sublabel = 'STM32F103';
  store.doc.nodes[0].fields = { model: '<old model>' };
  const baseline = structuredClone(store.doc);
  store.doc.nodes[0].sublabel = 'STM32F405';
  store.doc.nodes[0].fields.model = '<new model>';
  const html = technicalReportHTML(buildTechnicalReport(store.doc, { created, baseline, settings: { sections: ['changes'] } }));
  const comparison = html.match(/<section[^>]+id="changes">([\s\S]*?)<\/section>/)[1];
  assert.match(comparison, /Before/);
  assert.match(comparison, /After/);
  assert.match(comparison, /STM32F103/);
  assert.match(comparison, /STM32F405/);
  assert.match(comparison, /model.*&lt;old model&gt;/);
  assert.match(comparison, /model.*&lt;new model&gt;/);
  assert.doesNotMatch(comparison, /\[object Object\]|<old model>|<new model>/);
});

test('rejected requirements retain their disposition in both report tables', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store } = fixture();
  store.doc.engineering.requirements[0].status = 'rejected';
  const report = buildTechnicalReport(store.doc, { created, settings: { sections: ['requirements', 'verification'] } });
  assert.equal(report.summary.requirements.verified, 0);
  const html = technicalReportHTML(report);
  for (const section of ['requirements', 'verification']) {
    const content = html.match(new RegExp(`<section[^>]+id="${section}">([\\s\\S]*?)<\\/section>`))[1];
    assert.match(content, /Rejected/);
    assert.doesNotMatch(content, /Verification outstanding/);
  }
});

test('small declared power loads retain their nonzero value and missing limits remain unknown', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const store = new Store();
  const supply = addNode(store, 'battery', 0, 0), sensor = addNode(store, 'temp', 350, 0);
  addWire(store, 'power', { node: supply, port: 'out' }, { node: sensor, port: 'vcc' });
  store.doc.nodes.find(n => n.id === sensor).budget = { activeMa: 0.0001, activePeakMa: 0.0002 };
  const report = buildTechnicalReport(store.doc, { created, settings: { sections: ['power'] } });
  assert.equal(report.power[0].typicalMa, 0.0001);
  const html = technicalReportHTML(report);
  assert.match(html, /0\.1 µA/);
  assert.match(html, /0\.2 µA/);
  assert.doesNotMatch(html, /<td>0 mA<\/td>/);
  assert.match(html, /<td>Not declared<\/td>/);
});

test('custom fields named technicalReport invalidate design approval and parent verification when changed', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const store = new Store();
  const component = addNode(store, 'custom', 0, 0, {
    name: 'Sensor module', category: 'sensors',
    fields: [{ id: 'technicalReport', label: 'Model' }], ports: [],
  });
  store.doc.nodes[0].fields = { technicalReport: 'MODEL A' };
  const subsystem = groupSubsystem(store, [component], 'Sensing');
  const requirement = normalizeEngineering({ requirements: [{ id: 'REQ-1', text: 'Use the specified module',
    targets: [subsystem], status: 'verified', method: 'Inspection', evidence: 'inspection.pdf' }] }).requirements[0];
  requirement.verifiedFingerprint = requirementFingerprint(store.doc, requirement);
  store.doc.engineering = { requirements: [requirement] };
  const review = { revisionFingerprint: designFingerprint(store.doc), status: 'approved' };
  assert.equal(buildTechnicalReport(store.doc, { created }).summary.requirements.verified, 1);
  store.doc.nodes[0].subsystem.doc.nodes[0].fields.technicalReport = 'MODEL B';
  assert.equal(reviewState(store.doc, review), 'stale');
  assert.equal(buildTechnicalReport(store.doc, { created }).summary.requirements.verified, 0);
});

test('report snapshot identity distinguishes supplementary Unicode characters', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store } = fixture();
  store.doc.nodes[0].label = 'Controller 😀';
  const first = buildTechnicalReport(store.doc, { created });
  store.doc.nodes[0].label = 'Controller 😁';
  assert.notEqual(buildTechnicalReport(store.doc, { created }).source.fingerprint, first.source.fingerprint);
});

test('revision comparisons show scoped subsystem changes without exporting unselected engineering records', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store, controller, sensor } = fixture();
  groupSubsystem(store, [controller, sensor], 'Sensing subsystem');
  const child = store.doc.nodes[0].subsystem.doc;
  child.nodes[0].sublabel = 'STM32F103';
  child.engineering.requirements[0].evidence = 'PRIVATE-OLD-EVIDENCE.pdf';
  child.engineering.reviews = [{ id: 'R1', comments: [{ text: 'PRIVATE-REVIEW-COMMENT' }] }];
  const baseline = structuredClone(store.doc);
  child.nodes[0].sublabel = 'STM32F405';
  child.engineering.requirements[0].evidence = 'PRIVATE-NEW-EVIDENCE.pdf';
  const html = technicalReportHTML(buildTechnicalReport(store.doc, { created, baseline, settings: { sections: ['changes'] } }));
  assert.match(html, /Sensor gateway \/ Sensing subsystem/);
  assert.match(html, /STM32F103/);
  assert.match(html, /STM32F405/);
  assert.doesNotMatch(html, /PRIVATE-|&quot;schema&quot;|&quot;nodes&quot;/);
  const withEvidence = technicalReportHTML(buildTechnicalReport(store.doc, { created, baseline, settings: { sections: ['changes', 'verification'] } }));
  assert.match(withEvidence, /PRIVATE-OLD-EVIDENCE\.pdf/);
  assert.match(withEvidence, /PRIVATE-NEW-EVIDENCE\.pdf/);
  assert.doesNotMatch(withEvidence, /PRIVATE-REVIEW-COMMENT/);
});

test('a single evidence edit compares only the changed requirement in a large project', async () => {
  const { buildTechnicalReport, technicalReportHTML } = await reportAPI();
  const { store } = fixture();
  const requirement = store.doc.engineering.requirements[0];
  store.doc.engineering.requirements = Array.from({ length: 45 }, (_, i) => ({ ...requirement,
    id: `REQ-${i + 1}`, evidence: `bench-results-${i + 1}.pdf` }));
  const baseline = structuredClone(store.doc);
  store.doc.engineering.requirements[0].evidence = 'revised-bench-results-1.pdf';
  const report = buildTechnicalReport(store.doc, { created, baseline, settings: { sections: ['changes', 'verification'] } });
  assert.equal(report.comparison.changes.length, 1);
  assert.equal(report.comparison.changes[0].collection, 'requirements');
  assert.equal(report.comparison.changes[0].id, 'REQ-1');
  assert.deepEqual(report.comparison.changes[0].fields, [{ field: 'evidence', before: 'bench-results-1.pdf', after: 'revised-bench-results-1.pdf' }]);
  const comparison = technicalReportHTML(report).match(/<section[^>]+id="changes">([\s\S]*?)<\/section>/)[1];
  assert.match(comparison, /revised-bench-results-1\.pdf/);
  assert.doesNotMatch(comparison, /bench-results-45\.pdf|REQ-45/);
});

test('engineering comparisons identify added, removed, and edited records and budget fields', async () => {
  const { buildTechnicalReport } = await reportAPI();
  const { store } = fixture();
  store.doc.engineering.decisions = [{ id: 'ADR-1', text: 'Use I2C', rationale: 'Shared bus', owner: 'Morgan', status: 'accepted', targets: [] }];
  store.doc.engineering.budget = { mode: 'active', peaks: 'simultaneous' };
  const baseline = structuredClone(store.doc);
  store.doc.engineering.requirements = [{ ...store.doc.engineering.requirements[0], id: 'REQ-2', text: 'Retain sensor identity' }];
  store.doc.engineering.decisions[0].rationale = 'Short wiring harness';
  store.doc.engineering.budget.mode = 'sleep';
  const { changes } = buildTechnicalReport(store.doc, { created, baseline }).comparison;
  assert.ok(changes.some(r => r.collection === 'requirements' && r.type === 'removed' && r.id === 'REQ-1'));
  assert.ok(changes.some(r => r.collection === 'requirements' && r.type === 'added' && r.id === 'REQ-2'));
  assert.deepEqual(changes.find(r => r.collection === 'decisions').fields, [{ field: 'rationale', before: 'Shared bus', after: 'Short wiring harness' }]);
  assert.deepEqual(changes.find(r => r.collection === 'budget').fields, [{ field: 'mode', before: 'active', after: 'sleep' }]);
});
