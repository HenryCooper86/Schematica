import { reviewReadiness } from './validation-coverage.js';
import {
  verificationRows,
  verificationCSV,
  reviewState,
  exportReviews,
} from "./workflows.js";
import { resolveInterfaceEndpoint } from "./interface-checks.js";
import { architectureScopes } from "./architecture-scopes.js";
import { impactAnalysis } from "./impact.js";
import { renderReviewHTML } from "./review-html.js";
import { toCSV } from "./tabular.js";
import { checkDoc } from "./drc.js";
import { checkLayout } from "./layout-checks.js";
import { compareBoards } from "./compare.js";
import { interfaceRows, interfaceCSV } from "./engineering.js";
import { buildBOM, bomCSV } from "./bom.js";
import { powerSummary } from "./power.js";
import { buildHTML } from "./html-export.js";

function hash(value) {
  let h = 2166136261;
  for (const char of JSON.stringify(value))
    h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter((k) => !["x", "y", "w", "h", "label", "color"].includes(k))
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export function reviewFindings(doc) {
  const scopes = architectureScopes(doc);
  const scopeMap = new Map(scopes.map((s) => [s.key, s]));
  const counters = new Map();
  const layouts = scopes.flatMap((s) =>
    checkLayout(s.doc).map((f) =>
      s.path.length
        ? {
            ...f,
            analysisIds: f.ids.map((id) => JSON.stringify([...s.path, id])),
            ids: [s.path[0]],
          }
        : f,
    ),
  );
  return [...checkDoc(doc), ...layouts].map((finding) => {
    const paths = (finding.analysisIds || []).map((id) => JSON.parse(id));
    const common =
      paths.length &&
      paths.every(
        (p) =>
          JSON.stringify(p.slice(0, -1)) ===
          JSON.stringify(paths[0].slice(0, -1)),
      );
    let recordPath = null;
    if (finding.record && doc.nodes.some((n) => n.subsystem)) {
      try {
        const parsed = JSON.parse(finding.record);
        if (Array.isArray(parsed)) recordPath = parsed.slice(0, -1);
      } catch {
        /* plain ID */
      }
    }
    const scope =
      scopeMap.get(
        recordPath
          ? JSON.stringify(recordPath)
          : common
            ? JSON.stringify(paths[0].slice(0, -1))
            : "[]",
      ) || scopes[0];
    const sourceIds =
      paths.length &&
      paths.every((p) => JSON.stringify(p.slice(0, -1)) === scope.key)
        ? paths.map((p) => p.at(-1))
        : scope.key === "[]"
          ? finding.ids
          : [];
    const ids = [...sourceIds].sort();
    let record = finding.record || "";
    if (record && doc.nodes.some((n) => n.subsystem)) {
      try {
        record = JSON.parse(record).at(-1);
      } catch {
        /* legacy */
      }
    }
    const base = hash([finding.rule, ids, record]);
    const counterKey = scope.key + base;
    const count = counters.get(counterKey) || 0;
    counters.set(counterKey, count + 1);
    const exceptionId = `${finding.rule}-${base}-${count}`;
    const byId = new Map(
      [
        ...scope.doc.nodes,
        ...scope.doc.wires,
        ...scope.doc.zones,
        ...scope.doc.notes,
      ].map((i) => [i.id, i]),
    );
    const fingerprint = hash([
      ids.map((id) => canonical(byId.get(id))),
      scope.doc.engineering?.requirements,
      scope.doc.engineering?.budget,
      finding.rule.startsWith("layout") ? ids.map((id) => byId.get(id)) : null,
    ]);
    const exception = scope.doc.engineering?.exceptions?.find(
      (e) => e.id === exceptionId && e.fingerprint === fingerprint,
    );
    return {
      ...finding,
      id: scope.key === "[]" ? exceptionId : scope.key + ":" + exceptionId,
      exceptionId,
      fingerprint,
      scope: scope.key,
      scopeTitle: scope.title,
      sourceIds,
      ...(exception ? { exception } : {}),
    };
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
  const requirements = records("requirements"),
    decisions = records("decisions");
  const allocated = (r) => {
    const scope = scopes.find((s) => s.key === r.scope);
    const ids = new Set(
      [
        ...scope.doc.nodes,
        ...scope.doc.wires,
        ...scope.doc.zones,
        ...scope.doc.notes,
      ].map((i) => i.id),
    );
    return r.targets.length > 0 && r.targets.every((id) => ids.has(id));
  };
  return {
    format: "schematica-review",
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
          resolveInterfaceEndpoint(scope.doc, wires.get(r.id).from)
            .capability || null,
        toCapability:
          resolveInterfaceEndpoint(scope.doc, wires.get(r.id).to).capability ||
          null,
      }));
    }),
    bom: buildBOM(doc),
    power: powerSummary(doc),
    findings: reviewFindings(doc).map((f) => ({ ...f, ids: f.sourceIds })),
    requirements,
    decisions,
    verification: verificationRows(doc, baseline),
    savedViews: doc.engineering?.savedViews || [],
    reviews: scopes.flatMap((scope) =>
      (scope.doc.engineering?.reviews || []).map((r) => ({
        ...r,
        scope: scope.key,
        scopeTitle: scope.title,
        currentState: reviewState(scope.doc, r),
      })),
    ),
    interfaceReadiness: reviewReadiness(doc),
    coverage: {
      total: requirements.length,
      allocated: requirements.filter(allocated).length,
      verifiedWithEvidence: verificationRows(doc, baseline).filter(r => r.verified).length,
    },
    assumptions: {
      mode: doc.engineering?.budget?.mode || "active",
      peaks: doc.engineering?.budget?.peaks || "simultaneous",
      scopes: scopes.map((s) => ({
        scope: s.title,
        mode: s.doc.engineering?.budget?.mode || "active",
        peaks: s.doc.engineering?.budget?.peaks || "simultaneous",
      })),
      note: "Each subsystem uses its own operating and peak modes. Independent scope peaks are summed. Declared data only; conversion applies only where voltage and efficiency are specified. No transient, thermal, ageing, or electrical simulation. Evidence references are supplied by the author and are not independently verified.",
    },
    comparison: baseline ? compareBoards(baseline, doc) : null,
    impact: baseline ? impactAnalysis(baseline, doc) : null,
  };
}
export function reviewHTML(doc, baseline = null) {
  const report = reviewPackage(doc, baseline);
  const columns = [
    "scopeTitle",
    "id",
    "from",
    "to",
    "bus",
    "direction",
    "voltage",
    "voltageMinV",
    "voltageMaxV",
    "rate",
    "rateBps",
    "protocol",
    "source",
  ];
  const files = {
    "board.schematica.json": JSON.stringify(doc, null, 2),
    "interfaces.csv": interfaceCSV(doc),
    "interfaces-all.csv": toCSV([
      columns,
      ...report.interfaces.map((r) => columns.map((key) => r[key] ?? "")),
    ]),
    "bom.csv": bomCSV(report.bom),
    "review.json": JSON.stringify(report, null, 2),
    "verification.csv": verificationCSV(doc, baseline),
    "review-comments.json": exportReviews(doc),
  };
  return renderReviewHTML(
    report,
    files,
    Object.fromEntries(
      architectureScopes(doc).map((scope) => [scope.key, buildHTML(scope.doc)]),
    ),
  );
}
