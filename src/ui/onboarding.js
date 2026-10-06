import { EXAMPLES, localizedExample } from "../examples.js";
import { loadGuideBoard, walkthroughSession, introduceMismatch } from "../guided-review.js";
import { firstProjectProgress } from "../onboarding-progress.js";
import { checkDoc } from "../drc.js";
import { reviewHTML } from "../review.js";
import { download } from "../export.js";
import { escAttr as esc, toast, keepFocus } from "./press.js";
import { tr, getLang, onLanguageChange } from "../i18n.js";
export function initOnboarding({
  store,
  navigation,
  revisions,
  engineering,
  tools,
  connections,
}) {
  const button = document.createElement("button");
  button.id = "btn-guide";
  document.getElementById("palette-search").after(button);
  const panel = document.createElement("aside");
  panel.id = "first-project";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "guide-heading");
  document.getElementById("canvas-wrap").append(panel);
  let checked = "",
    exported = "";
  let session = null, loading = false, triedMismatch = false;
  const report = () => {
    const doc = navigation.rootDoc();
    return { doc, ...firstProjectProgress(doc, { checked, exported }) };
  };
  function paint() {
    button.textContent = tr("First project");
    button.setAttribute("aria-expanded", String(!panel.hidden));
    if (panel.hidden) return;
    const restoreFocus = keepFocus(panel);
    const { checks, ready } = report();
    const activeWalkthrough = session && session.generation === store.generation;
    const canMismatch = activeWalkthrough && !triedMismatch && session.snapshot === JSON.stringify(store.doc);
    panel.innerHTML = `<header><h2 id="guide-heading">${esc(tr("Your first architecture"))}</h2><button id="guide-close" aria-label="${esc(tr("Close"))}">×</button></header>
      <p>${esc(tr("Work on this board or load a starter. Follow the steps to make a reviewable design."))}</p><div class="guide-actions"><button id="guide-starter" ${loading ? 'disabled' : ''}>${esc(tr("Load sensor starter"))}</button><button id="guide-uart" ${loading ? 'disabled' : ''}>${esc(tr('Start UART review walkthrough'))}</button></div>
      <p>${esc(tr('Loading saves a recovery revision first. Use Revisions to restore your previous board.'))}</p><button id="guide-revisions">${esc(tr('Review versions'))}</button>
      <details ${activeWalkthrough ? 'open' : ''}><summary>${esc(tr('UART review in six steps'))}</summary>
      <ol><li>${esc(tr('Load the declared UART reference. It is ready for interface review.'))}</li>
      <li>${esc(tr('Introduce a mismatch: the first receiver supports 9600 bit/s but the connection requires 115200 bit/s.'))}</li>
      <li>${esc(tr('Run checks and inspect the bandwidth finding.'))}</li>
      <li>${esc(tr('Repair in Interfaces: set To endpoint capabilities → Bandwidth (bit/s) to 115200, then Save interface.'))}</li>
      <li>${esc(tr('Run checks again and export the review package.'))}</li>
      <li>${esc(tr('Undo the repair to see the mismatch return. Undo again restores the original contract.'))}</li></ol>
      <p>${esc(tr('This is an illustrative interface contract, not tested hardware.'))}</p></details>
      <div class="guide-actions"><button id="guide-mismatch" ${canMismatch ? '' : 'disabled'}>${esc(tr('Introduce rate mismatch'))}</button><button id="guide-repair" ${activeWalkthrough ? '' : 'disabled'}>${esc(tr('Repair UART interface'))}</button><button id="guide-undo" ${store.canUndo() ? '' : 'disabled'}>${esc(tr('Undo'))}</button></div>
      ${activeWalkthrough ? '' : `<ol>${[tr("Place parts from the palette."), tr("Drag between ports to connect parts."), tr("Declare direction, voltage, protocol, rate, and source."), tr("Run checks and inspect the findings."), tr("Export a review package for a colleague.")].map((label, i) => `<li>${checks[i] ? "✓ " : ""}${esc(label)}</li>`).join("")}</ol>`}
      <div class="guide-actions"><button id="guide-connect">${esc(tr('Connect ports'))}</button><button id="guide-interfaces">${esc(tr("Edit interfaces"))}</button><button id="guide-check">${esc(tr("Run checks"))}</button><button id="guide-export">${esc(tr("Export review package"))}</button></div>
      <p role="status">${checks.filter(Boolean).length}/5 ${esc(activeWalkthrough ? tr('review requirements met') : tr("steps complete"))} · ${esc(ready ? tr("Ready for interface review") : tr("Not ready for interface review"))}</p>`;
    panel.querySelector("#guide-close").onclick = () => {
      panel.hidden = true;
      paint();
      button.focus();
    };
    const load = async id => {
      if (loading) return;
      loading = true;
      paint();
      let loaded = false;
      try {
        const example = localizedExample(
          EXAMPLES.find((e) => e.id === id),
          getLang(),
        );
        await loadGuideBoard({ store, rootDoc: () => navigation.rootDoc(), revisions, doc: example.doc });
        session = id === 'declared-uart-reference' ? walkthroughSession(store, example.doc) : null;
        triedMismatch = false;
        tools.zoomFit();
        checked = "";
        exported = "";
        loaded = true;
        paint();
      } catch (e) {
        toast(e.message);
      } finally {
        loading = false;
        paint();
        if (loaded && !panel.hidden && !document.querySelector('dialog[open]'))
          panel.querySelector(session ? '#guide-mismatch' : '#guide-connect').focus();
      }
    };
    panel.querySelector('#guide-starter').onclick = () => load('sensor-node-clean');
    panel.querySelector('#guide-uart').onclick = () => load('declared-uart-reference');
    panel.querySelector('#guide-revisions').onclick = () => engineering.openRevisions();
    panel.querySelector('#guide-mismatch').onclick = () => {
      try { introduceMismatch(store, session); triedMismatch = true; paint(); panel.querySelector('#guide-repair').focus(); }
      catch (e) { toast(e.message); }
    };
    panel.querySelector('#guide-repair').onclick = () => {
      if (!activeWalkthrough) return;
      store.setSelection(['w1']);
      engineering.openTab('interfaces');
    };
    panel.querySelector('#guide-undo').onclick = () => store.undo();
    panel.querySelector('#guide-connect').onclick = () => connections.open();
    panel.querySelector("#guide-interfaces").onclick = () =>
      engineering.openTab("interfaces");
    panel.querySelector("#guide-check").onclick = () => {
      const { doc, mark } = report();
      checkDoc(doc);
      checked = mark;
      document.getElementById("btn-check").click();
      paint();
    };
    restoreFocus();
    panel.querySelector("#guide-export").onclick = () => {
      const { doc, mark } = report();
      download("first-architecture-review.html", reviewHTML(doc), "text/html");
      exported = mark;
      paint();
    };
  }
  button.onclick = () => {
    panel.hidden = !panel.hidden;
    paint();
    if (!panel.hidden) panel.querySelector("#guide-starter").focus();
  };
  store.subscribe(() => {
    if (!store.isDragging()) paint();
  });
  onLanguageChange(paint);
  paint();
}
