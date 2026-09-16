import { architectureScopes } from "./architecture-scopes.js";
import { toCSV } from "./tabular.js";
const str = (v) => (typeof v === "string" ? v.slice(0, 20000) : "");
const list = (v) => (Array.isArray(v) ? v : []);
const unique = (rows) => [
  ...new Map(rows.filter((r) => r.id).map((r) => [r.id, r])).values(),
];
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
// Content identity for local review bookkeeping, not an authenticated signature.
export function fingerprint(value) {
  let a = 2166136261,
    b = 5381;
  for (const ch of JSON.stringify(canonical(value))) {
    const c = ch.charCodeAt(0);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b, 33) ^ c;
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
function designValue(value) {
  if (Array.isArray(value)) return value.map(designValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([k]) =>
          ![
            "reviews",
            "savedViews",
            "verifiedFingerprint",
            "verifiedAt",
          ].includes(k),
      )
      .map(([k, v]) => [k, designValue(v)])
      .filter(([k, v]) => k !== "engineering" || Object.keys(v || {}).length),
  );
}
export const designFingerprint = (doc) => fingerprint(designValue(doc));
export function requirementFingerprint(doc, record) {
  const targets = new Set(record.targets);
  const wires = doc.wires.filter(
    (w) =>
      targets.has(w.id) || targets.has(w.from.node) || targets.has(w.to.node),
  );
  for (const wire of wires) {
    targets.add(wire.id);
    targets.add(wire.from.node);
    targets.add(wire.to.node);
  }
  const meaningful = (item) => {
    const value = Object.fromEntries(Object.entries(item).filter(([key]) => !['x','y','w','h','color'].includes(key)));
    if (item.subsystem) {
      const child = designValue(item.subsystem.doc);
      for (const kind of ['nodes','wires','notes','zones']) child[kind] = child[kind].map(meaningful);
      value.subsystem = { ...item.subsystem, doc: child };
    }
    return value;
  };
  return fingerprint({
    text: record.text,
    rationale: record.rationale,
    method: record.method || "",
    targets: record.targets,
    items: [...doc.nodes, ...doc.wires, ...doc.notes, ...doc.zones]
      .filter((i) => targets.has(i.id))
      .map(meaningful),
    budget: doc.engineering?.budget || null,
  });
}
export function verificationRows(doc, baseline = null) {
  const old = new Map(
    (baseline ? architectureScopes(baseline) : []).map((s) => [s.key, s.doc]),
  );
  return architectureScopes(doc).flatMap((scope) =>
    (scope.doc.engineering?.requirements || []).map((r) => {
      const ids = new Set(
        [
          ...scope.doc.nodes,
          ...scope.doc.wires,
          ...scope.doc.notes,
          ...scope.doc.zones,
        ].map((i) => i.id),
      );
      const allocated =
        !!r.targets.length && r.targets.every((id) => ids.has(id));
      const current = requirementFingerprint(scope.doc, r);
      const prior = old
        .get(scope.key)
        ?.engineering?.requirements?.find((x) => x.id === r.id);
      return {
        ...r,
        scope: scope.key,
        scopeTitle: scope.title,
        allocated,
        needsReview:
          r.status === "verified" &&
          (!r.verifiedFingerprint || r.verifiedFingerprint !== current),
        changed: baseline
          ? !prior ||
            requirementFingerprint(old.get(scope.key), prior) !== current
          : false,
        verified:
          r.status === "verified" &&
          !!r.evidence?.trim() &&
          !!r.method?.trim() &&
          allocated &&
          r.verifiedFingerprint === current,
      };
    }),
  );
}
export function verificationCSV(doc, baseline) {
  const columns = [
    "scopeTitle",
    "id",
    "text",
    "owner",
    "status",
    "method",
    "evidence",
    "allocated",
    "needsReview",
    "changed",
    "verified",
  ];
  return toCSV([
    columns,
    ...verificationRows(doc, baseline).map((r) =>
      columns.map((k) => r[k] ?? ""),
    ),
  ]);
}
export function normalizeViews(raw) {
  return unique(
    list(raw)
      .slice(0, 100)
      .filter((v) => v && typeof v === "object")
      .map((v) => ({
        id: str(v.id).slice(0, 200),
        name: str(v.name).slice(0, 200),
        scope: list(v.scope).slice(0, 8).map(str),
        query: str(v.query),
        bus: str(v.bus),
        connections: ["all", "neighbors", "network"].includes(v.connections)
          ? v.connections
          : "all",
        depth: ["overview", "normal", "full", "auto"].includes(v.depth)
          ? v.depth
          : "full",
        selection: list(v.selection).slice(0, 2000).map(str),
        camera: {
          x: Number.isFinite(v.camera?.x)
            ? Math.max(-1e6, Math.min(1e6, v.camera.x))
            : 0,
          y: Number.isFinite(v.camera?.y)
            ? Math.max(-1e6, Math.min(1e6, v.camera.y))
            : 0,
          zoom: Number.isFinite(v.camera?.zoom)
            ? Math.max(0.05, Math.min(8, v.camera.zoom))
            : 1,
        },
      })),
  );
}
export function normalizeReviews(raw) {
  return unique(
    list(raw)
      .slice(0, 100)
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        id: str(r.id).slice(0, 200),
        revisionId: str(r.revisionId).slice(0, 200),
        revisionFingerprint: str(r.revisionFingerprint).slice(0, 200),
        title: str(r.title),
        author: str(r.author),
        at: str(r.at),
        status: ["draft", "approved", "changes-requested"].includes(r.status)
          ? r.status
          : "draft",
        comments: unique(
          list(r.comments)
            .slice(0, 500)
            .filter((c) => c && typeof c === "object")
            .map((c) => ({
              id: str(c.id).slice(0, 200),
              author: str(c.author),
              text: str(c.text),
              at: str(c.at),
              resolved: c.resolved === true,
              targetType: ["node", "wire", "requirement"].includes(c.targetType)
                ? c.targetType
                : "node",
              target: str(c.target),
            })),
        ),
      })),
  );
}
export const reviewState = (doc, review) =>
  review.revisionFingerprint === designFingerprint(doc)
    ? review.status
    : "stale";
export function exportReviews(doc) {
  return JSON.stringify(
    {
      format: "schematica-comments",
      version: 1,
      reviews: architectureScopes(doc).flatMap((s) =>
        (s.doc.engineering?.reviews || []).map((r) => ({
          ...r,
          scope: s.path,
        })),
      ),
    },
    null,
    2,
  );
}
export function importReviews(doc, text) {
  const raw = JSON.parse(text);
  if (
    raw?.format !== "schematica-comments" ||
    raw.version !== 1 ||
    !Array.isArray(raw.reviews)
  )
    throw new Error("Not a Schematica review file");
  if (raw.reviews.length > 1000)
    throw new Error("Review file exceeds 1000 records");
  const proposals = new Map();
  for (const value of raw.reviews) {
    const path = value?.scope || [];
    if (
      !Array.isArray(path) ||
      path.length > 8 ||
      path.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid review scope");
    const target = scopeDoc(doc, path);
    if (!target) throw new Error("Review refers to a missing subsystem");
    const incoming = normalizeReviews([value])[0];
    if (!incoming) throw new Error("Invalid review record");
    const existing =
      proposals.get(target) ||
      structuredClone(target.engineering?.reviews || []);
    proposals.set(target, existing);
    const same = existing.find((x) => x.id === incoming.id);
    if (!same) existing.push(incoming);
    else if (fingerprint(same) !== fingerprint(incoming)) {
      const id = incoming.id.slice(0, 150) + "-import-" + fingerprint(incoming);
      if (!existing.some((x) => x.id === id))
        existing.push({ ...incoming, id });
    }
    if (existing.length > 100)
      throw new Error("At most 100 review records are supported");
  }
  for (const [target, reviews] of proposals) {
    target.engineering ||= {};
    target.engineering.reviews = reviews;
  }
}
export const scopeDoc = (root, path) =>
  path.reduce(
    (doc, id) => doc?.nodes.find((n) => n.id === id)?.subsystem?.doc,
    root,
  );
