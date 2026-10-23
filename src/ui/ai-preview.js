import { blueprintMarkup } from './blueprint-ui.js';
import { escAttr as esc, openModal, toast } from "./press.js";
import { impactSummary } from "./impact-summary.js";
import { tr } from "../i18n.js";
import { renderChangePreview } from './change-preview.js';
import { fixOutcome } from '../ai/fix-outcome.js';
const KIND = { nodes: () => tr('part'), wires: () => tr('wire'), zones: () => tr('zone'), notes: () => tr('note') };

// The answer to "did it fix it, and what does it delete?", above the details.
function outcomeMarkup(outcome) {
  let s = '';
  if (outcome.targets.length) {
    s += `<section class="preview-outcome"><h3>${esc(tr('Outcome'))}</h3><ul>`
      + outcome.targets.map((t) => t.resolved
        ? `<li class="ok">✓ ${esc(tr('Fixed: {message}', { message: t.finding.message }))}</li>`
        : t.deleted.length
          ? `<li class="open">✗ ${esc(tr('Cleared only by deleting {items}: {message}', { items: t.deleted.join(', '), message: t.finding.message }))}</li>`
          : `<li class="open">✗ ${esc(tr('Still reported: {message}', { message: t.now.message }))}</li>`).join('')
      + outcome.introduced.map((f) => `<li class="new">⚠ ${esc(tr('New finding: {message}', { message: f.message }))}</li>`).join('')
      + '</ul></section>';
  }
  if (outcome.removed.length) {
    s += `<section class="preview-removals" role="alert"><h3>${esc(tr('This draft deletes {count} item(s)', { count: outcome.removed.length }))}</h3><ul>`
      + outcome.removed.map((c) => `<li>${esc(c.label || c.id)} <small>${esc(KIND[c.collection]())}</small></li>`).join('')
      + '</ul></section>';
  }
  return s;
}

export function showEditPreview(preview, onFinish, { targets = [] } = {}) {
  const dialog = document.createElement("dialog");
  dialog.id = "ai-preview-dialog";
  dialog.className = "workflow-dialog";
  dialog.setAttribute("aria-labelledby", "ai-preview-heading");
  const report = preview.summary();
  const outcome = fixOutcome({ targets, before: report.before, after: report.after, changes: report.comparison.changes, board: report.boards.before });
  // The header (with a close button) and the Discard/Apply footer stay pinned
  // while the change list scrolls, so a long preview never hides them.
  dialog.innerHTML = `<header class="preview-head"><h2 id="ai-preview-heading">${esc(tr("Preview AI changes"))}</h2>
    <button type="button" id="ai-preview-close" class="preview-close" title="${esc(tr("Discard draft"))}" aria-label="${esc(tr("Discard draft"))}">&times;</button></header>
    ${outcomeMarkup(outcome)}
    <p>${esc(tr("The board is unchanged. Review the draft before applying it."))}</p>
    <section id="ai-visual-preview"></section>
    ${report.comparison.changes.some(c => c.fields?.some(f => f.field === 'blueprint')) ? `<h3>${esc(tr('Blueprint'))}</h3><div class="workflow-columns"><section><h4>${esc(tr('Before'))}</h4>${blueprintMarkup(report.comparison.changes.find(c => c.fields?.some(f => f.field === 'blueprint')).fields[0].before)}</section><section><h4>${esc(tr('After'))}</h4>${blueprintMarkup(preview.draft.doc.blueprint)}</section></div>` : ''}
    ${report.comparison.changes.some(c => c.collection === 'journey') ? `<h3>${esc(tr('Presentation'))}</h3><ol>${(preview.draft.doc.journey || []).map(ch => `<li><strong>${esc(ch.label)}</strong><p>${esc(ch.caption)}</p><ol>${(ch.stops || []).map(stop => `<li>${esc(preview.draft.doc.nodes.find(n => n.id === stop.node)?.label || stop.node)}: ${esc(stop.caption)}</li>`).join('')}</ol></li>`).join('')}</ol>` : ''}
    <h3>${esc(tr("Changes"))}</h3><ul>${report.comparison.changes.filter(c => !c.fields?.some(f => f.field === 'blueprint')).map((c) => `<li>${esc(c.type)} · ${esc(c.label || c.id || c.collection)} <ul>${(c.fields || []).map((f) => `<li>${esc(f.field)}: <del>${esc(typeof f.before === "object" ? JSON.stringify(f.before) : f.before)}</del> → <ins>${esc(typeof f.after === "object" ? JSON.stringify(f.after) : f.after)}</ins></li>`).join("")}</ul></li>`).join("")}</ul>
    ${impactSummary(report.impact)}<h3>${esc(tr("Design checks before and after"))}</h3>
    <div class="workflow-columns">${[report.before, report.after].map((findings, i) => `<section><h4>${esc(i ? tr("After") : tr("Before"))} (${findings.length})</h4><ul>${findings.map((f) => `<li>${esc(f.level)} · ${esc(f.message)}</li>`).join("")}</ul></section>`).join("")}</div>
    <footer class="preview-foot"><p role="status" id="preview-status"></p><button id="ai-preview-discard">${esc(tr("Discard draft"))}</button><button id="ai-preview-apply">${esc(tr("Apply changes"))}</button></footer>`;
  document.body.append(dialog);
  renderChangePreview(dialog.querySelector('#ai-visual-preview'), report.boards.before, report.boards.after);
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
  dialog.querySelector("#ai-preview-close").onclick = () => dialog.close();
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
