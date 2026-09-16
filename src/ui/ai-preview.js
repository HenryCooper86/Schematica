import { escAttr as esc, openModal, toast } from "./press.js";
import { impactSummary } from "./impact-summary.js";
import { tr } from "../i18n.js";
export function showEditPreview(preview, onFinish) {
  const dialog = document.createElement("dialog");
  dialog.id = "ai-preview-dialog";
  dialog.className = "workflow-dialog";
  dialog.setAttribute("aria-labelledby", "ai-preview-heading");
  const report = preview.summary();
  dialog.innerHTML = `<h2 id="ai-preview-heading">${esc(tr("Preview AI changes"))}</h2>
    <p>${esc(tr("The board is unchanged. Review the draft before applying it."))}</p>
    <h3>${esc(tr("Changes"))}</h3><ul>${report.comparison.changes.map((c) => `<li>${esc(c.type)} · ${esc(c.label || c.id || c.collection)} <ul>${(c.fields || []).map((f) => `<li>${esc(f.field)}: <del>${esc(typeof f.before === "object" ? JSON.stringify(f.before) : f.before)}</del> → <ins>${esc(typeof f.after === "object" ? JSON.stringify(f.after) : f.after)}</ins></li>`).join("")}</ul></li>`).join("")}</ul>
    ${impactSummary(report.impact)}<h3>${esc(tr("Design checks before and after"))}</h3>
    <div class="workflow-columns">${[report.before, report.after].map((findings, i) => `<section><h4>${esc(i ? tr("After") : tr("Before"))} (${findings.length})</h4><ul>${findings.map((f) => `<li>${esc(f.level)} · ${esc(f.message)}</li>`).join("")}</ul></section>`).join("")}</div>
    <p role="status" id="preview-status"></p><footer><button id="ai-preview-discard">${esc(tr("Discard draft"))}</button><button id="ai-preview-apply">${esc(tr("Apply changes"))}</button></footer>`;
  document.body.append(dialog);
  let applied = false;
  const update = () => {
    const stale = preview.stale();
    dialog.querySelector("#ai-preview-apply").disabled = stale;
    dialog.querySelector("#preview-status").textContent = stale
      ? tr("The board changed. Generate a new preview before applying.")
      : "";
  };
  // Check again at commit, including edits from imports and other controls.
  dialog.querySelector("#ai-preview-apply").onclick = () => {
    try {
      preview.apply();
      applied = true;
      dialog.close();
    } catch (e) {
      toast(e.message);
      update();
    }
  };
  dialog.querySelector("#ai-preview-discard").onclick = () => dialog.close();
  dialog
    .querySelectorAll("[data-impact-id]")
    .forEach((b) => (b.disabled = true));
  dialog.addEventListener(
    "close",
    () => {
      if (!applied) preview.discard();
      dialog.remove();
      onFinish(applied);
    },
    { once: true },
  );
  dialog.querySelector("h2").tabIndex = -1;
  openModal(dialog);
  dialog.querySelector("h2").focus({ preventScroll: true });
  dialog.scrollTop = 0;
  update();
}
