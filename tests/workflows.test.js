import test from "node:test";
import assert from "node:assert/strict";
import { Store, addNode, addWire, newDoc } from "../src/state.js";
import {
  groupSubsystem,
  createSubsystemNavigation,
} from "../src/subsystems.js";
import { powerRails } from "../src/power.js";
import { buildBOM } from "../src/bom.js";
import { reviewFindings, reviewPackage, reviewHTML } from "../src/review.js";
import { createEditPreview } from "../src/ai/preview.js";
import { createRevisions } from "../src/revisions.js";
import { serialize, deserialize } from "../src/serialize.js";
import {
  designFingerprint,
  requirementFingerprint,
  verificationRows,
  verificationCSV,
  reviewState,
  exportReviews,
  importReviews,
} from "../src/workflows.js";
function powered() {
  const store = new Store();
  const a = addNode(store, "battery", 0, 0),
    b = addNode(store, "mcu", 400, 0);
  addWire(store, "power", { node: a, port: "out" }, { node: b, port: "vcc" });
  store.doc.nodes[1].budget = {
    activeMa: 100,
    sleepMa: 1,
    activePeakMa: 200,
    sleepPeakMa: 2,
  };
  return { store, a, b };
}
test("nested subsystem mode is identical in child, root power, BOM and review", () => {
  const { store, a, b } = powered();
  const id = groupSubsystem(store, [a, b], "Control");
  const nav = createSubsystemNavigation(store);
  nav.enter(id);
  store.doc.engineering = { budget: { mode: "sleep", peaks: "simultaneous" } };
  assert.equal(powerRails(store.doc)[0].typicalMa, 1);
  assert.equal(powerRails(nav.rootDoc())[0].typicalMa, 1);
  assert.equal(
    buildBOM(nav.rootDoc()).find((r) => r.kind === "mcu").currentMa,
    1,
  );
  assert.equal(reviewPackage(nav.rootDoc()).power[0].typicalMa, 1);
  nav.up();
  const outer = groupSubsystem(store, [id], "Outer");
  assert.equal(powerRails(store.doc)[0].typicalMa, 1);
  assert.ok(outer);
});
test("grouping preserves configured modes and each scope has independent peak assumptions", () => {
  const { store, a, b } = powered();
  store.doc.engineering = { budget: { mode: "sleep", peaks: "noncoincident" } };
  const id = groupSubsystem(store, [b], "Sleeping");
  assert.equal(
    store.doc.nodes.find((n) => n.id === id).subsystem.doc.engineering.budget
      .mode,
    "sleep",
  );
  const c = addNode(store, "mcu", 800, 0);
  store.doc.nodes.find((n) => n.id === c).budget = {
    activeMa: 20,
    activePeakMa: 40,
  };
  addWire(store, "power", { node: a, port: "out" }, { node: c, port: "vcc" });
  store.doc.engineering.budget.mode = "active";
  const rail = powerRails(store.doc)[0];
  assert.equal(rail.typicalMa, 21);
  assert.equal(rail.peakMa, 42);
});
test("nested exception retains identity, rationale and scope in the root export and expires after engineering edits", () => {
  const { store, a, b } = powered();
  const id = groupSubsystem(store, [a, b], "Control");
  const child = store.doc.nodes[0].subsystem.doc;
  const f = reviewFindings(child).find((f) => f.rule === "unconnected-power");
  child.engineering = {
    exceptions: [
      {
        id: f.id,
        fingerprint: f.fingerprint,
        rationale: "Prototype",
        owner: "R",
      },
    ],
  };
  const report = reviewPackage(store.doc),
    nested = report.findings.find((f) => f.exception);
  assert.equal(nested.exception.rationale, "Prototype");
  assert.equal(nested.scope, JSON.stringify([id]));
  assert.deepEqual(nested.ids, f.ids);
  child.nodes.find((n) => f.ids.includes(n.id)).rail = "5V";
  assert.equal(
    reviewPackage(store.doc).findings.filter((f) => f.exception).length,
    0,
  );
});
test("AI preview isolates changes, commits in one undo step, and can be discarded", () => {
  const { store } = powered(),
    before = serialize(store.doc),
    count = store.undoStack.length;
  const preview = createEditPreview(store);
  addNode(preview.draft, "temp", 700, 0);
  assert.equal(serialize(store.doc), before);
  assert.ok(preview.summary().comparison.changes.length);
  preview.apply();
  assert.equal(store.undoStack.length, count + 1);
  store.undo();
  assert.equal(serialize(store.doc), before);
  const next = createEditPreview(store);
  addNode(next.draft, "temp", 700, 0);
  next.discard();
  assert.throws(() => next.apply());
  assert.equal(serialize(store.doc), before);
});
test("AI preview refuses a changed or replaced source board", () => {
  const { store } = powered();
  const p = createEditPreview(store);
  store.apply((d) => (d.title = "Edited"));
  assert.throws(() => p.apply(), /board changed/);
  const q = createEditPreview(store);
  store.replaceDoc(structuredClone(store.doc));
  assert.throws(() => q.apply(), /board changed/);
});
test("verification tracks evidence against allocated design and adjacent interfaces", () => {
  const { store, b } = powered();
  const r = {
    id: "REQ",
    text: "Control",
    rationale: "Need",
    owner: "E",
    targets: [b],
    status: "verified",
    method: "Bench test",
    evidence: "result.pdf",
  };
  r.verifiedFingerprint = requirementFingerprint(store.doc, r);
  store.doc.engineering = { requirements: [r] };
  const baseline = structuredClone(store.doc);
  assert.equal(verificationRows(store.doc)[0].verified, true);
  store.doc.nodes.find((n) => n.id === b).x += 20;
  assert.equal(verificationRows(store.doc)[0].needsReview, false);
  store.doc.wires[0].spec = { voltage: "5V" };
  const row = verificationRows(store.doc, baseline)[0];
  assert.equal(row.needsReview, true);
  assert.equal(row.changed, true);
  assert.equal(row.verified, false);
  assert.match(verificationCSV(store.doc, baseline), /Bench test/);
});
test("review comments round-trip, approvals become stale, and conflicting imports preserve both versions", () => {
  const { store, b } = powered();
  const r = {
    id: "review1",
    revisionId: "rev1",
    revisionFingerprint: designFingerprint(store.doc),
    title: "Review",
    author: "E",
    at: "today",
    status: "approved",
    comments: [
      {
        id: "c1",
        author: "E",
        text: "Check supply",
        targetType: "node",
        target: b,
        at: "today",
        resolved: true,
      },
    ],
  };
  store.doc.engineering = { reviews: [r] };
  assert.equal(reviewState(store.doc, r), "approved");
  const back = deserialize(serialize(store.doc)).doc;
  assert.deepEqual(back.engineering.reviews, [r]);
  assert.equal(reviewState(back, back.engineering.reviews[0]), "approved");
  const file = exportReviews(store.doc);
  back.engineering.reviews[0].comments[0].text = "Local edit";
  importReviews(back, file);
  assert.equal(back.engineering.reviews.length, 2);
  importReviews(back, file);
  assert.equal(back.engineering.reviews.length, 2);
  back.nodes[0].rail = "12V";
  assert.equal(reviewState(back, r), "stale");
});
test("saved views and verification stamps survive serialization and review export", () => {
  const { store, b } = powered();
  store.doc.engineering = {
    savedViews: [
      {
        id: "v",
        name: "Power",
        scope: [],
        query: "MCU",
        bus: "power",
        connections: "network",
        depth: "overview",
        selection: [b],
        camera: { x: 20, y: 30, zoom: 1.2 },
      },
    ],
  };
  const back = deserialize(serialize(store.doc)).doc;
  assert.deepEqual(
    back.engineering.savedViews,
    store.doc.engineering.savedViews,
  );
  const html = reviewHTML(back);
  assert.match(html, /Choose a saved view/);
  assert.match(html, /verification.csv/);
  assert.match(html, /schematica-saved-view/);
});
test("transaction failure preserves durable revisions; retry persists newer memory-only revisions", async () => {
  const rows = new Map();
  let fail = false;
  const database = {
    read: async () => [...rows.values()],
    write: async (entries) => {
      if (fail) throw Error("quota");
      for (const e of entries) rows.set(e.id, structuredClone(e));
    },
  };
  let errors = 0;
  const r = createRevisions(null, { database, onError: () => errors++ });
  await r.ready;
  const old = r.save(newDoc("Old"));
  await r.flush();
  fail = true;
  const next = r.save(newDoc("New"));
  await r.flush();
  assert.equal(rows.size, 1);
  assert.ok(rows.has(old.id));
  assert.equal(r.list().find((e) => e.id === next.id).durable, false);
  assert.equal(errors, 1);
  fail = false;
  await r.retry();
  assert.equal(r.list().find((e) => e.id === next.id).durable, true);
  const reload = createRevisions(null, { database });
  await reload.ready;
  assert.equal(reload.restore(next.id).title, "New");
});
test("unallocated child requirements retain reviewed exceptions without item IDs", () => {
  const { store, a, b } = powered();
  groupSubsystem(store, [a, b], "Child");
  const child = store.doc.nodes[0].subsystem.doc;
  child.engineering = {
    requirements: [
      {
        id: "REQ",
        text: "Unallocated",
        targets: [],
        status: "draft",
        evidence: "",
        rationale: "",
        owner: "",
      },
    ],
  };
  const f = reviewFindings(child).find(
    (f) => f.rule === "requirement-unallocated",
  );
  child.engineering.exceptions = [
    { id: f.id, fingerprint: f.fingerprint, owner: "R", rationale: "Later" },
  ];
  assert.equal(
    reviewPackage(store.doc).findings.find(
      (f) => f.rule === "requirement-unallocated",
    ).exception.rationale,
    "Later",
  );
});
test('subsystem requirement evidence ignores internal review metadata and movement but tracks engineering edits', () => {
  const {store,a,b}=powered();const id=groupSubsystem(store,[a,b],'Control');
  const r={id:'REQ',text:'Control subsystem',rationale:'',targets:[id],status:'verified',method:'Bench',evidence:'report'};
  r.verifiedFingerprint=requirementFingerprint(store.doc,r);store.doc.engineering={requirements:[r]};
  const child=store.doc.nodes[0].subsystem.doc;child.nodes[0].x+=30;child.engineering={reviews:[]};
  assert.equal(verificationRows(store.doc)[0].verified,true);
  child.nodes[1].budget.activeMa=80;assert.equal(verificationRows(store.doc)[0].needsReview,true);
});
