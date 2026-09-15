import { resolveInterfaceEndpoint } from './interface-checks.js';
import { architectureScopes } from './architecture-scopes.js';
import { impactAnalysis } from './impact.js';
import { renderReviewHTML } from './review-html.js';
import { toCSV } from './tabular.js';
import { checkDoc } from './drc.js';
import { checkLayout } from './layout-checks.js';
import { compareBoards } from './compare.js';
import { interfaceRows, interfaceCSV } from './engineering.js';
import { buildBOM, bomCSV } from './bom.js';
import { powerSummary } from './power.js';
import { buildHTML } from './html-export.js';

function hash(value) {
  let h = 2166136261;
  for (const char of JSON.stringify(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter((k) => !['x', 'y', 'w', 'h', 'label', 'color'].includes(k))
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export function reviewFindings(doc) {
  const counters = new Map();
  const byId = new Map(
    [...doc.nodes, ...doc.wires, ...doc.zones, ...doc.notes].map((item) => [item.id, item]),
  );
  return [...checkDoc(doc), ...checkLayout(doc)].map((finding) => {
    const ids = [...finding.ids].sort();
    const base = hash([finding.rule, ids, finding.record || '']);
    const count = counters.get(base) || 0;
    counters.set(base, count + 1);
    const id = `${finding.rule}-${base}-${count}`;
    // A waiver stops applying when relevant engineering data changes.
    const fingerprint = hash([
      ids.map((id) => canonical(byId.get(id))),
      doc.engineering?.requirements,
      doc.engineering?.budget,
      finding.rule.startsWith('layout') ? ids.map((id) => byId.get(id)) : null,
    ]);
    const exception = doc.engineering?.exceptions?.find(
      (e) => e.id === id && e.fingerprint === fingerprint,
    );
    return { ...finding, id, fingerprint, ...(exception ? { exception } : {}) };
  });
}
export function reviewPackage(doc, baseline = null) {
  const scopes = architectureScopes(doc);
  const records = (kind) =>
    scopes.flatMap((scope) =>
      (scope.doc.engineering?.[kind] || []).map((r) => ({
        ...r,
        scope: scope.key,
        scopeTitle: scope.title,
      })),
    );
  const requirements = records('requirements'),
    decisions = records('decisions');
  const allocated = (r) => {
    const scope = scopes.find((s) => s.key === r.scope);
    const ids = new Set(
      [...scope.doc.nodes, ...scope.doc.wires, ...scope.doc.zones, ...scope.doc.notes].map(
        (i) => i.id,
      ),
    );
    return r.targets.length > 0 && r.targets.every((id) => ids.has(id));
  };
  return {
    format: 'schematica-review',
    version: 2,
    created: new Date().toISOString(),
    board: structuredClone(doc),
    scopes: scopes.map(({ key, title }) => ({ key, title })),
    interfaces: scopes.flatMap((scope) => {
      const wires = new Map(scope.doc.wires.map((w) => [w.id, w]));
      return interfaceRows(scope.doc).map((r) => ({
        ...r,
        scope: scope.key,
        scopeTitle: scope.title,
        fromCapability:
          resolveInterfaceEndpoint(scope.doc, wires.get(r.id).from).capability || null,
        toCapability: resolveInterfaceEndpoint(scope.doc, wires.get(r.id).to).capability || null,
      }));
    }),
    bom: buildBOM(doc),
    power: powerSummary(doc),
    findings: reviewFindings(doc).map((f) => ({ ...f, scope: '[]', scopeTitle: doc.title })),
    requirements,
    decisions,
    coverage: {
      total: requirements.length,
      allocated: requirements.filter(allocated).length,
      verifiedWithEvidence: requirements.filter(
        (r) => r.status === 'verified' && r.evidence.trim() && allocated(r),
      ).length,
    },
    assumptions: {
      mode: doc.engineering?.budget?.mode || 'active',
      peaks: doc.engineering?.budget?.peaks || 'simultaneous',
      note: 'Declared data only; conversion applies only where voltage and efficiency are specified. No transient, thermal, ageing, or electrical simulation. Evidence references are supplied by the author and are not independently verified.',
    },
    comparison: baseline ? compareBoards(baseline, doc) : null,
    impact: baseline ? impactAnalysis(baseline, doc) : null,
  };
}
export function reviewHTML(doc, baseline = null) {
  const report = reviewPackage(doc, baseline);
  const columns = [
    'scopeTitle',
    'id',
    'from',
    'to',
    'bus',
    'direction',
    'voltage',
    'voltageMinV',
    'voltageMaxV',
    'rate',
    'rateBps',
    'protocol',
    'source',
  ];
  const files = {
    'board.schematica.json': JSON.stringify(doc, null, 2),
    'interfaces.csv': interfaceCSV(doc),
    'interfaces-all.csv': toCSV([
      columns,
      ...report.interfaces.map((r) => columns.map((key) => r[key] ?? '')),
    ]),
    'bom.csv': bomCSV(report.bom),
    'review.json': JSON.stringify(report, null, 2),
  };
  return renderReviewHTML(
    report,
    files,
    Object.fromEntries(architectureScopes(doc).map((scope) => [scope.key, buildHTML(scope.doc)])),
  );
}
