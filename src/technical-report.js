import { validateSecurityAnalysis } from './security-analysis.js';
import { architectureScopes } from './architecture-scopes.js';
import { buildExportSVG } from './export.js';
import { reviewPackage } from './review.js';
import { fingerprint } from './workflows.js';
import { normalizeReportSettings } from './report-settings.js';
import { compareBoards } from './compare.js';
export { technicalReportHTML } from './technical-report-html.js';

// Presentation changes do not belong in the design comparison.
function designSnapshot(doc) {
  const copy = structuredClone(doc);
  for (const scope of architectureScopes(copy)) {
    if (!scope.doc.engineering) continue;
    delete scope.doc.engineering.technicalReport;
    if (!Object.keys(scope.doc.engineering).length) delete scope.doc.engineering;
  }
  return copy;
}

// Compare scope-local items rather than dumping an editable child document into
// an added subsystem or changed engineering field. Section selection also applies
// to the records shown in the comparison.
function reportComparison(source, baseline, sections) {
  const select = (record, keys) => Object.fromEntries(keys.filter(key => key in record).map(key => [key, record[key]]));
  const project = doc => {
    const copy = structuredClone(doc);
    copy.nodes = copy.nodes.map(node => {
      if (!node.subsystem) return node;
      const { doc: child, ...subsystem } = node.subsystem;
      return { ...node, subsystem: { ...subsystem, title: child.title } };
    });
    const original = copy.engineering || {}, engineering = {};
    if (sections.includes('power') && original.budget) engineering.budget = original.budget;
    if (sections.includes('requirements') || sections.includes('verification')) {
      const keys = ['id', 'status', 'targets',
        ...(sections.includes('requirements') ? ['text', 'rationale', 'owner'] : []),
        ...(sections.includes('verification') ? ['method', 'evidence'] : [])];
      if (original.requirements?.length) engineering.requirements = original.requirements.map(r => select(r, keys));
    }
    if (sections.includes('decisions') && original.decisions?.length) engineering.decisions = original.decisions.map(r => select(r, ['id', 'text', 'rationale', 'owner', 'status', 'targets']));
    delete copy.engineering;
    // Source text is disclosed only by the dedicated, selected security section.
    delete copy.securityAnalysis;
    return { design: copy, engineering };
  };
  const recordChanges = (prev, next, collection) => {
    const board = records => ({ title: '', nodes: records || [], wires: [], notes: [], zones: [], journey: [] });
    return compareBoards(board(prev), board(next)).changes.map(change => ({ ...change, collection,
      label: collection === 'budget' ? 'Budget assumptions' : change.label === change.id ? change.id : `${change.id}: ${change.label}` }));
  };
  const before = new Map(architectureScopes(baseline).map(scope => [scope.key, scope]));
  const after = new Map(architectureScopes(source).map(scope => [scope.key, scope]));
  const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap(key => {
    const prev = before.get(key), next = after.get(key), scope = next || prev;
    const empty = { title: scope.doc.title, nodes: [], wires: [], notes: [], zones: [], journey: [] };
    const a = project(prev?.doc || empty), b = project(next?.doc || empty);
    const budget = value => value ? [{ id: 'budget', ...value }] : [];
    return [...compareBoards(a.design, b.design).changes,
      ...recordChanges(a.engineering.requirements, b.engineering.requirements, 'requirements'),
      ...recordChanges(a.engineering.decisions, b.engineering.decisions, 'decisions'),
      ...recordChanges(budget(a.engineering.budget), budget(b.engineering.budget), 'budget')]
      .map(change => ({ ...change, scope: key, scopeTitle: scope.title }));
  });
  return { version: 1, beforeTitle: baseline.title, afterTitle: source.title, changes };
}

export function buildTechnicalReport(doc, { settings = {}, baseline = null, created = new Date().toISOString() } = {}) {
  const snapshot = structuredClone(doc);
  const details = normalizeReportSettings({ ...snapshot.engineering?.technicalReport, ...settings });
  const time = new Date(created).toISOString();
  const source = designSnapshot(snapshot);
  const review = reviewPackage(source, baseline ? designSnapshot(baseline) : null);
  const scopes = architectureScopes(source);
  const labels = new Map(scopes.map(scope => [scope.key, new Map([
    ...scope.doc.nodes, ...scope.doc.wires, ...scope.doc.zones, ...scope.doc.notes,
  ].map(item => [item.id, item.label || item.text || item.id]))]));
  const verification = review.verification.map(record => ({ ...record,
    allocationLabels: record.targets.map(id => labels.get(record.scope).get(id) || `Missing item: ${id}`),
  }));
  const counts = Object.fromEntries(['error', 'warning', 'info'].map(level => [level, review.findings.filter(f => f.level === level).length]));
  return {
    format: 'schematica-technical-report', version: 1, created: time,
    source: { title: snapshot.title, fingerprint: fingerprint(snapshot),
      ...(baseline ? { baselineTitle: baseline.title, baselineFingerprint: fingerprint(baseline) } : {}) },
    details: { ...details, title: details.title.trim() || (snapshot.title + ' - Technical report').slice(0, 240), date: details.date || time.slice(0, 10) },
    summary: { components: review.bom.reduce((sum, row) => sum + row.qty, 0), subsystems: scopes.length - 1,
      coverage: review.interfaceReadiness.coverage, ready: review.interfaceReadiness.ready, findings: counts,
      requirements: { total: review.requirements.length, allocated: review.coverage.allocated, verified: review.coverage.verifiedWithEvidence } },
    figures: details.sections.includes('architecture') ? scopes.map((scope, index) => ({
      number: index + 1, title: scope.title, key: scope.key,
      caption: `Figure ${index + 1}. ${scope.title} (${scope.doc.nodes.length} parts and subsystems, ${scope.doc.wires.length} connections in this view).`,
      svg: buildExportSVG(scope.doc, { theme: 'light' }),
    })) : [],
    interfaces: review.interfaces, requirements: review.requirements, decisions: review.decisions,
    power: review.power, bom: review.bom, findings: review.findings, verification,
    security: details.sections.includes('security') ? scopes.filter(scope => scope.doc.securityAnalysis).map(scope => ({
      scopeTitle: scope.title, analysis: validateSecurityAnalysis(scope.doc.securityAnalysis),
    })) : [],
    assumptions: review.assumptions, comparison: baseline ? reportComparison(source, designSnapshot(baseline), details.sections) : null, impact: review.impact,
  };
}
