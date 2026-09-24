import { EXAMPLES, localizedExample } from "../examples.js";
import { deserialize, serialize } from "../serialize.js";
import { firstProjectProgress } from "../onboarding-progress.js";
import { checkDoc } from "../drc.js";
import { reviewHTML } from "../review.js";
import { download } from "../export.js";
import { escAttr as esc, toast } from "./press.js";
import { tr, getLang, onLanguageChange } from "../i18n.js";
export function initOnboarding({
  store,
  navigation,
  revisions,
  engineering,
  tools,
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
  const report = () => {
    const doc = navigation.rootDoc();
    return { doc, ...firstProjectProgress(doc, { checked, exported }) };
  };
  function paint() {
    button.textContent = tr("First project");
    button.setAttribute("aria-expanded", String(!panel.hidden));
    if (panel.hidden) return;
    const { checks, ready } = report();
    panel.innerHTML = `<header><h2 id="guide-heading">${esc(tr("Your first architecture"))}</h2><button id="guide-close" aria-label="${esc(tr("Close"))}">×</button></header>
      <p>${esc(tr("Work on this board or load a starter. Follow the steps to make a reviewable design."))}</p><button id="guide-starter">${esc(tr("Load sensor starter"))}</button>
      <ol>${[tr("Place parts from the palette."), tr("Drag between ports to connect parts."), tr("Declare direction, voltage, protocol, rate, and source."), tr("Run checks and inspect the findings."), tr("Export a review package for a colleague.")].map((label, i) => `<li>${checks[i] ? "✓ " : ""}${esc(label)}</li>`).join("")}</ol>
      <div class="guide-actions"><button id="guide-interfaces">${esc(tr("Edit interfaces"))}</button><button id="guide-check">${esc(tr("Run checks"))}</button><button id="guide-export">${esc(tr("Export review package"))}</button></div>
      <p role="status">${checks.filter(Boolean).length}/5 ${esc(tr("steps complete"))} · ${esc(ready ? tr("Ready for interface review") : tr("Not ready for interface review"))}</p>`;
    panel.querySelector("#guide-close").onclick = () => {
      panel.hidden = true;
      paint();
      button.focus();
    };
    panel.querySelector("#guide-starter").onclick = async () => {
      try {
        const current = navigation.rootDoc(), generation = store.generation, snapshot = JSON.stringify(navigation.rootDoc());
        if (
          current.nodes.length ||
          current.notes.length ||
          current.zones.length
        ) {
          await revisions.ready;
          const saved = revisions.save(current, current.title, "before-guide");
          await revisions.flush();
          if (!revisions.list().find((r) => r.id === saved.id)?.durable)
            throw new Error(
              tr("Save the current board to a file before loading the starter.",
              ),
            );
        }
        if (generation !== store.generation || snapshot !== JSON.stringify(navigation.rootDoc())) throw new Error(tr('The board changed. Preview again before applying.'));
        const example = localizedExample(
          EXAMPLES.find((e) => e.id === "sensor-node-clean"),
          getLang(),
        );
        store.replaceDoc(deserialize(serialize(example.doc)).doc);
        tools.zoomFit();
        checked = "";
        exported = "";
        paint();
      } catch (e) {
        toast(e.message);
      }
    };
    panel.querySelector("#guide-interfaces").onclick = () =>
      engineering.openTab("interfaces");
    panel.querySelector("#guide-check").onclick = () => {
      const { doc, mark } = report();
      checkDoc(doc);
      checked = mark;
      document.getElementById("btn-check").click();
      paint();
    };
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
