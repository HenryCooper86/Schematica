import {
  verificationRows,
  verificationCSV,
  designFingerprint,
  reviewState,
  exportReviews,
  importReviews,
  scopeDoc,
} from "../workflows.js";
import { uid } from "../state.js";
import { download } from "../export.js";
import { escAttr as esc, toast } from "./press.js";
import { tr } from "../i18n.js";
const field = (name, label, value = "") =>
  `<label>${esc(label)}<input name="${name}" value="${esc(value)}" maxlength="20000" required></label>`;
const option = (value, label) =>
  `<option value="${esc(value)}">${esc(label)}</option>`;
const safe = (fn) => async (e) => {
  e?.preventDefault();
  try {
    await fn(e);
  } catch (error) {
    toast(error.message);
  }
};
const eng = (doc) => (doc.engineering ||= {});
export function renderWorkflow({
  tab,
  body,
  store,
  navigation,
  revisions,
  baseline,
  explorer,
  tools,
  paint,
  close,
  openTab,
}) {
  if (tab === "matrix") {
    body.innerHTML = `<p>${esc(tr("Evidence is current only after verification against the allocated design. Changed allocations require another review."))}</p>
      <label>${esc(tr("Filter requirements"))}<input id="matrix-filter" type="search"></label><label><input id="matrix-review" type="checkbox">${esc(tr("Needs verification review"))}</label>
      <button id="matrix-export">${esc(tr("Export verification CSV"))}</button><div id="matrix-table" class="workflow-table"></div>`;
    const rows = verificationRows(navigation.rootDoc(), baseline);
    const draw = () => {
      const q = body.querySelector("#matrix-filter").value.toLowerCase(),
        needs = body.querySelector("#matrix-review").checked;
      const shown = rows.filter(
        (r) =>
          `${r.id} ${r.text} ${r.owner} ${r.scopeTitle}`
            .toLowerCase()
            .includes(q) &&
          (!needs || r.needsReview || !r.verified),
      );
      body.querySelector("#matrix-table").innerHTML =
        `<table><thead><tr>${[tr("Record ID"), tr("Scope"), tr("Owner"), tr("Verification method"), tr("Evidence URL"), tr("Verification status"), tr("Changes")].map((t) => `<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>${shown.map((r) => `<tr><td><button data-req="${esc(r.id)}" data-scope="${esc(r.scope)}">${esc(r.id)}</button><p>${esc(r.text)}</p></td><td>${esc(r.scopeTitle)}</td><td>${esc(r.owner)}</td><td>${esc(r.method)}</td><td>${esc(r.evidence)}</td><td>${esc(r.verified ? tr("Verified") : r.needsReview ? tr("Needs verification review") : !r.allocated ? tr("Unallocated") : tr("Draft"))}</td><td>${esc(r.changed ? tr("Changed since baseline") : "—")}</td></tr>`).join("")}</tbody></table>`;
      body.querySelectorAll("[data-req]").forEach(
        (b) =>
          (b.onclick = safe(() => {
            while (navigation.depth()) navigation.up();
            for (const id of JSON.parse(b.dataset.scope)) navigation.enter(id);
            openTab("requirements", b.dataset.req);
          })),
      );
    };
    body.querySelector("#matrix-filter").oninput = draw;
    body.querySelector("#matrix-review").onchange = draw;
    body.querySelector("#matrix-export").onclick = () =>
      download(
        "verification.csv",
        verificationCSV(navigation.rootDoc(), baseline),
        "text/csv",
      );
    draw();
  } else if (tab === "views") {
    const root = navigation.rootDoc(),
      views = root.engineering?.savedViews || [];
    body.innerHTML = `<p>${esc(tr("Save the current scope, filters, selection, detail level, and camera. Views share one architecture."))}</p>
      <form id="view-form">${field("name", tr("View name"))}<button>${esc(tr("Save current view"))}</button></form>
      <ul>${views.map((v) => `<li><strong>${esc(v.name)}</strong> <button data-view="${esc(v.id)}">${esc(tr("Open view"))}</button> <button data-delete-view="${esc(v.id)}">${esc(tr("Delete"))}</button></li>`).join("")}</ul>`;
    body.querySelector("#view-form").onsubmit = safe((e) => {
      if (views.length >= 100)
        throw new Error(tr("At most 100 saved views are supported."));
      const name = new FormData(e.currentTarget).get("name").trim();
      if (!name) return;
      const view = {
        id: uid("view"),
        name,
        scope: navigation.path(),
        ...explorer.capture(),
        camera: { ...tools.view },
        selection: [...store.selection],
      };
      while (navigation.depth()) navigation.up();
      store.apply((doc) => {
        (eng(doc).savedViews ||= []).push(view);
      });
      paint();
    });
    body.querySelectorAll("[data-view]").forEach(
      (b) =>
        (b.onclick = safe(() => {
          const view = views.find((v) => v.id === b.dataset.view);
          if (!scopeDoc(root, view.scope))
            throw new Error(
              tr("The saved view refers to a missing subsystem."),
            );
          while (navigation.depth()) navigation.up();
          for (const id of view.scope) navigation.enter(id);
          explorer.restore(view);
          close();
        })),
    );
    body.querySelectorAll("[data-delete-view]").forEach(
      (b) =>
        (b.onclick = () => {
          while (navigation.depth()) navigation.up();
          store.apply((doc) => {
            eng(doc).savedViews = views.filter(
              (v) => v.id !== b.dataset.deleteView,
            );
          });
          paint();
        }),
    );
  } else if (tab === "comments") {
    const reviews = store.doc.engineering?.reviews || [];
    const targets = [
      ...store.doc.nodes.map((n) => ["node", n.id, n.label]),
      ...store.doc.wires.map((w) => ["wire", w.id, w.id]),
      ...(store.doc.engineering?.requirements || []).map((r) => [
        "requirement",
        r.id,
        r.id,
      ]),
    ];
    const statusName = (status) =>
      ({
        draft: tr("Draft"),
        approved: tr("Approved"),
        "changes-requested": tr("Changes requested"),
        stale: tr("Stale review"),
      })[status];
    body.innerHTML = `<p>${esc(tr("Reviews refer to a saved revision. Names are local records, not authenticated signatures. Changes make approval stale."))}</p>
      <form id="review-start">${field("author", tr("Reviewer"))}${field("title", tr("Review title"))}<button>${esc(tr("Start revision review"))}</button></form>
      <button id="comments-export">${esc(tr("Export review comments"))}</button><label>${esc(tr("Import review comments"))}<input id="comments-import" type="file" accept=".json"></label>
      <div>${reviews
        .map(
          (
            r,
          ) => `<section class="review-record" data-review="${esc(r.id)}"><h3>${esc(r.title)} · ${esc(statusName(reviewState(store.doc, r)))}</h3><p>${esc(r.author)} · ${esc(r.revisionId)} · ${esc(r.at)}</p>
        <ul>${r.comments.map((c) => `<li><strong>${esc(c.author)}</strong> · ${esc(c.targetType)} ${esc(c.target)}<p>${esc(c.text)}</p><button data-resolve="${esc(c.id)}">${esc(c.resolved ? tr("Reopen comment") : tr("Resolve comment"))}</button></li>`).join("")}</ul>
        <form data-comment-form>${field("author", tr("Comment author"), r.author)}<label>${esc(tr("Comment target"))}<select name="target">${targets.map((t) => option(JSON.stringify(t.slice(0, 2)), t[2])).join("")}</select></label><label>${esc(tr("Comment"))}<textarea name="text" required maxlength="20000"></textarea></label><button${targets.length ? "" : " disabled"}>${esc(tr("Add comment"))}</button></form>
        <button data-status="approved"${reviewState(store.doc, r) === "stale" ? " disabled" : ""}>${esc(tr("Approve revision"))}</button><button data-status="changes-requested">${esc(tr("Request changes"))}</button></section>`,
        )
        .join("")}</div>`;
    body.querySelector("#review-start").onsubmit = safe(async (e) => {
      if (reviews.length >= 100)
        throw new Error(tr("At most 100 review records are supported."));
      const data = new FormData(e.currentTarget),
        title = data.get("title").trim(),
        author = data.get("author").trim();
      if (!title || !author) return;
      const generation = store.generation, snapshot = JSON.stringify(store.doc);
      const snap = revisions.save(store.doc, title, "review");
      await revisions.flush();
      if (!revisions.list().find(r => r.id === snap.id)?.durable) throw new Error(tr('Not saved — export or retry'));
      if (store.generation !== generation || JSON.stringify(store.doc) !== snapshot) throw new Error(tr('The board changed. Preview again before applying.'));
      const review = {
        id: uid("review"),
        revisionId: snap.id,
        revisionFingerprint: designFingerprint(store.doc),
        title,
        author,
        at: new Date().toISOString(),
        status: "draft",
        comments: [],
      };
      store.apply((doc) => {
        (eng(doc).reviews ||= []).push(review);
      });
      paint();
    });
    body.querySelector("#comments-export").onclick = () =>
      download(
        "review-comments.json",
        exportReviews(store.doc),
        "application/json",
      );
    body.querySelector("#comments-import").onchange = safe(async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 16 * 1024 * 1024)
        throw new Error(tr("Board file exceeds 16 MiB."));
      const snapshot = JSON.stringify(store.doc),
        generation = store.generation,
        text = await file.text();
      if (
        snapshot !== JSON.stringify(store.doc) ||
        generation !== store.generation
      )
        throw new Error(
          tr("The board changed. Preview again before applying."),
        );
      const draft = structuredClone(store.doc);
      importReviews(draft, text);
      store.apply((doc) => {
        doc.engineering = draft.engineering;
        doc.nodes = draft.nodes;
      });
      paint();
    });
    body.querySelectorAll("[data-review]").forEach((section) => {
      const review = reviews.find((r) => r.id === section.dataset.review);
      const edit = (fn) => {
        store.apply((doc) =>
          fn(doc.engineering.reviews.find((r) => r.id === review.id)),
        );
        paint();
      };
      section.querySelector("[data-comment-form]").onsubmit = safe((e) => {
        if (review.comments.length >= 500)
          throw new Error(tr("At most 500 comments are supported per review."));
        const data = new FormData(e.currentTarget),
          [targetType, target] = JSON.parse(data.get("target"));
        if (!data.get("text").trim() || !data.get("author").trim()) return;
        edit((r) => {
          r.comments.push({
            id: uid("comment"),
            author: data.get("author").trim(),
            text: data.get("text").trim(),
            targetType,
            target,
            at: new Date().toISOString(),
            resolved: false,
          });
          r.status = "draft";
        });
      });
      section.querySelectorAll("[data-resolve]").forEach(
        (b) =>
          (b.onclick = () =>
            edit((r) => {
              const c = r.comments.find((c) => c.id === b.dataset.resolve);
              c.resolved = !c.resolved;
              r.status = "draft";
            })),
      );
      section.querySelectorAll("[data-status]").forEach(
        (b) =>
          (b.onclick = safe(() => {
            if (
              b.dataset.status === "approved" &&
              (reviewState(store.doc, review) === "stale" ||
                review.comments.some((c) => !c.resolved))
            )
              throw new Error(
                tr("Resolve open comments and review the current revision before approval.",
                ),
              );
            edit((r) => {
              r.status = b.dataset.status;
            });
          })),
      );
    });
  }
}
